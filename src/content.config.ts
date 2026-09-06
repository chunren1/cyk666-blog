import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const articles = defineCollection({
	// Markdown 文章目录：src/data/articles/*.md
	loader: glob({ pattern: '**/*.md', base: './src/data/articles' }),
	schema: z.object({
		title: z.string(),
		date: z.coerce.date(),
		description: z.string().default(''),
		tags: z.array(z.string()).default([]),
	}),
});

export const collections = { articles };
