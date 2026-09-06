---
title: "学研在线：基于 Spring Cloud Alibaba 的微服务实践"
date: 2026-06-28
description: "基于 Spring Cloud Alibaba 的在线教育平台全栈项目。4 个核心微服务（用户、课程、订单、支付）独立部署；RabbitMQ 延迟队列 + 死信交换机处理订单超时取消；Seata 协调分布式事务；Nacos 注册/配置中心 + Sentinel 限流熔断 + Gateway 统一路由；前端 Vue 3 + TypeScript。"
tags: ["Spring Cloud", "微服务", "RabbitMQ", "Seata"]
---

学研在线是一个在线教育平台的全栈项目，Java 17 + Vue 3，前后端分离。后端基于 Spring Cloud Alibaba，把用户、课程、订单、支付四个业务域拆成独立微服务，重点实践了服务拆分、远程调用、分布式事务和异步消息这几块高并发场景的核心能力。

## 项目背景与目标

为什么要拆微服务？早期版本是单体，订单和支付写在一个服务里，课程秒杀流量一来，整个系统跟着抖动。拆分的动力很朴素：让不同业务域独立部署、独立扩容，把核心链路拆开，避免一次故障拖垮全局。我给自己定了三个目标：

- 四个独立服务：用户、课程、订单、支付，各自独立部署；
- 统一入口与治理：Gateway 路由 + Nacos 注册配置中心 + Sentinel 限流熔断；
- 关键链路可靠：RabbitMQ 延迟队列处理订单超时，Seata 保证跨服务下单与库存扣减一致。

## 技术选型与整体架构

后端版本为 Spring Boot 3.2.0 + Spring Cloud 2023.0.0，配套 Spring Cloud Alibaba 组件。前端 Vue 3 + TypeScript，Axios 封装请求，Pinia 管理状态。整体调用链路如下：

```text
浏览器
 └─→ Gateway（统一路由 / 限流 / 鉴权入口）
       ├─→ 用户服务 user-service
       ├─→ 课程服务 course-service
       ├─→ 订单服务 order-service
       └─→ 支付服务 pay-service
             ├─ Nacos（服务注册 / 配置中心）
             ├─ Sentinel（限流 / 熔断）
             ├─ RabbitMQ（延迟队列 + 死信交换机）
             └─ Seata（分布式事务协调）
```

## 核心特性详解

### 服务治理：Nacos + Gateway + Sentinel

四个服务启动后自动注册到 Nacos，Gateway 统一收流量、按路径转发，配置也集中放到 Nacos，改配置不用重启服务。Sentinel 给订单和支付接口配置了 QPS 限流，超出的请求直接返回降级提示，保护支付回调这类核心接口。路由配置很简单：

```yml
spring:
  cloud:
    gateway:
      routes:
        - id: order-service
          uri: lb://order-service
          predicates:
            - Path=/api/order/**
```

### RabbitMQ 延迟队列：订单超时自动取消

下单后 30 分钟未支付就要自动取消，这是延迟队列的典型场景。方案用的是死信交换机：消息先进延迟队列，TTL 到期后投递给死信交换机，再由它转发到取消队列，消费者收到就执行关单、释放库存。

```java
// 延迟队列 + 死信交换机
@Bean
Queue delayQueue() {
  return QueueBuilder.durable("order.delay.queue")
      .ttl(30 * 60 * 1000)                 // 30 分钟
      .deadLetterExchange("order.dlx")     // 死信交换机
      .deadLetterRoutingKey("order.cancel")
      .build();
}
```

```java
// 取消订单消费者
@RabbitListener(queues = "order.cancel.queue")
public void handle(OrderCancelMsg msg) {
  Order order = orderService.getById(msg.getOrderId());
  if (order.getStatus() == OrderStatus.UNPAID) {
    orderService.cancel(order);   // 关单 + 释放库存
  }
}
```

### Seata 分布式事务：下单与库存扣减

下单跨两个服务：订单服务建订单，课程服务扣库存，必须保证要么都成功、要么都失败。用 Seata 的 AT 模式，入口方法加一个注解，Seata 自动接管各分支的本地事务，任一分支失败就全局回滚。

```java
@GlobalTransactional(name = "create-order-tx", rollbackFor = Exception.class)
public Long createOrder(Long courseId, Long userId) {
  Long orderId = orderFeign.create(courseId, userId); // 订单服务建单
  courseFeign.deductStock(courseId);                  // 课程服务扣库存
  return orderId;
}
```

> [!WARNING] 用 Seata 一定要想清楚分支事务的幂等与补偿。AT 模式靠全局锁保证隔离，热点课程库存并发高时会有锁竞争，我的做法是给库存扣减接口加 Sentinel 限流兜底，把热点流量挡在事务外面。

### Vue 3 + TypeScript 前端

前端按页面拆模块：登录态用 Pinia 统一管理，Axios 拦截器处理 token 刷新和统一错误提示。课程详情、下单页、支付回调都有独立的页面和状态处理，和服务端走标准 REST 接口，两边约定统一的响应体结构，联调省了不少事。

## 踩坑与设计决策

### 消息的可靠性与幂等

一开始直接发延迟消息，服务一重启就丢消息。后来补了两件事：发送端开启 publisher confirms，失败重发；消费端按 orderId 做幂等，取消请求重复收到也不会重复执行关单。

### 服务拆分的边界

最开始把订单和支付拆在一个服务里，后来发现支付回调、对账逻辑和订单状态强绑定，还是拆开更清晰。两个服务的边界用事件解耦：订单状态变更发消息，支付服务监听处理，互不阻塞。

### 事务范围要小

Seata 事务里只放关键写操作，外部调用、短信通知全部挪到事务之外，把事务时间压短，全局锁占用时间自然就短。

> [!NOTE] 分布式事务能不用就不用，能缩小范围就缩小范围。很多场景下，异步消息加最终一致性是比强事务更优的解。

## 结果与收获

学研在线把服务拆分、注册发现、配置中心、网关路由、限流熔断、延迟队列、分布式事务整条链路都跑通了：下单流程由 Seata 保证跨服务一致，30 分钟未支付的订单由延迟队列自动取消，核心接口有 Sentinel 兜底。这个项目让我把微服务从概念变成了工程实践，也让我明白，每一步拆分背后都要想清楚系统到底该怎么协作。

> 微服务不是为了拆分而拆分。每一个服务边界、每一条消息、每一笔事务，背后都是一次对系统协作方式的重新思考。