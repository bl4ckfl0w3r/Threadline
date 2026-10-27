import { database } from '@/server/runtime';
import { loadExampleCase } from './example-data';
export async function exampleCase(id: string) { return loadExampleCase(database(), id); }
