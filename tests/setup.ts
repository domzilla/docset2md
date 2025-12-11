/**
 * @file setup.ts
 * @module tests/setup
 * @author Dominic Rodemer
 * @created 2025-12-11
 * @license MIT
 *
 * @fileoverview Global test setup with test data path helpers.
 */

import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Test data paths
export const TEST_DATA_DIR = resolve(__dirname, '../test_data/input');
export const APPLE_DOCSET_PATH = resolve(TEST_DATA_DIR, 'Apple_UIKit_Reference.docset');
export const PHP_DOCSET_PATH = resolve(TEST_DATA_DIR, 'PHP.docset');
export const C_DOCSET_PATH = resolve(TEST_DATA_DIR, 'C.docset');

// Helper to check if Apple test data is available
export function hasAppleTestData(): boolean {
  return existsSync(APPLE_DOCSET_PATH);
}

// Helper to check if PHP test data is available
export function hasPhpTestData(): boolean {
  return existsSync(PHP_DOCSET_PATH);
}

// Helper to check if C test data is available
export function hasCTestData(): boolean {
  return existsSync(C_DOCSET_PATH);
}

// Skip message for missing Apple test data
export const APPLE_SKIP_MESSAGE =
  'Apple test data not found. Run: npx tsx scripts/extract-framework-apple-docset.ts UIKit';
