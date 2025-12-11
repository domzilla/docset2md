#!/usr/bin/env npx tsx
/**
 * Extract a framework-specific test docset from an Apple docset
 *
 * Usage:
 *   npx tsx scripts/extract-framework-apple-docset.ts -i <source.docset> -o <output-dir> <framework> [framework2 ...]
 *
 * Examples:
 *   npx tsx scripts/extract-framework-apple-docset.ts -i Apple_API_Reference.docset -o test_data/input UIKit
 *   npx tsx scripts/extract-framework-apple-docset.ts --input ./Apple.docset --output ./out Foundation CoreData
 */

import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function generateUuid(requestKey: string): string {
  let prefix: string;
  let canonicalPath: string;

  if (requestKey.startsWith('ls/')) {
    prefix = 'ls';
    canonicalPath = '/' + requestKey.slice(3);
  } else if (requestKey.startsWith('lc/')) {
    prefix = 'lc';
    canonicalPath = '/' + requestKey.slice(3);
  } else {
    throw new Error(`Invalid request key format: ${requestKey}`);
  }

  const hash = createHash('sha1').update(canonicalPath).digest();
  const truncated = hash.subarray(0, 6);
  const suffix = truncated.toString('base64url');

  return prefix + suffix;
}

function printUsage() {
  console.log(`
Usage: npx tsx scripts/extract-framework-apple-docset.ts -i <source.docset> -o <output-dir> <framework> [framework2 ...]

Extract specific frameworks from an Apple docset into a smaller test docset.

Required:
  -i, --input <path>     Path to source Apple docset
  -o, --output <path>    Output directory for extracted docset

Arguments:
  framework              One or more framework names (case-insensitive)

Examples:
  npx tsx scripts/extract-framework-apple-docset.ts -i Apple_API_Reference.docset -o test_data/input UIKit
  npx tsx scripts/extract-framework-apple-docset.ts --input ./Apple.docset --output ./out Foundation CoreData

Available frameworks can be listed with:
  npm run dev -- list-frameworks <docset-path>
`);
}

// Common framework name mappings for proper display
const FRAMEWORK_DISPLAY_NAMES: Record<string, string> = {
  uikit: 'UIKit',
  appkit: 'AppKit',
  swiftui: 'SwiftUI',
  coredata: 'CoreData',
  coregraphics: 'CoreGraphics',
  coreanimation: 'CoreAnimation',
  corefoundation: 'CoreFoundation',
  corelocation: 'CoreLocation',
  corebluetooth: 'CoreBluetooth',
  coreml: 'CoreML',
  coreimage: 'CoreImage',
  coreaudio: 'CoreAudio',
  avfoundation: 'AVFoundation',
  arkit: 'ARKit',
  realitykit: 'RealityKit',
  scenekit: 'SceneKit',
  spritekit: 'SpriteKit',
  gamekit: 'GameKit',
  healthkit: 'HealthKit',
  homekit: 'HomeKit',
  mapkit: 'MapKit',
  watchkit: 'WatchKit',
  cloudkit: 'CloudKit',
  storekit: 'StoreKit',
  eventkit: 'EventKit',
  photokit: 'PhotoKit',
  webkit: 'WebKit',
  sirikit: 'SiriKit',
  passkit: 'PassKit',
  pdfkit: 'PDFKit',
  metalkit: 'MetalKit',
};

function getDisplayName(framework: string): string {
  const lower = framework.toLowerCase();
  return FRAMEWORK_DISPLAY_NAMES[lower] || framework.charAt(0).toUpperCase() + framework.slice(1).toLowerCase();
}

interface ParsedArgs {
  input: string;
  output: string;
  frameworks: string[];
}

function parseArgs(args: string[]): ParsedArgs | null {
  let input: string | null = null;
  let output: string | null = null;
  const frameworks: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-i' || arg === '--input') {
      input = args[++i];
    } else if (arg === '-o' || arg === '--output') {
      output = args[++i];
    } else if (arg === '-h' || arg === '--help') {
      return null;
    } else if (!arg.startsWith('-')) {
      frameworks.push(arg);
    }
  }

  if (!input || !output || frameworks.length === 0) {
    return null;
  }

  return { input: resolve(input), output: resolve(output), frameworks };
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    printUsage();
    process.exit(args.length === 0 ? 1 : 0);
  }

  const parsed = parseArgs(args);
  if (!parsed) {
    printUsage();
    process.exit(1);
  }

  const { input: sourceDocset, output: outputDir, frameworks: frameworkArgs } = parsed;

  // Validate source docset exists
  if (!existsSync(sourceDocset)) {
    console.error(`Error: Source docset not found: ${sourceDocset}`);
    process.exit(1);
  }

  const frameworks = frameworkArgs.map(f => f.toLowerCase());
  const frameworksDisplay = frameworkArgs.map(getDisplayName);

  // Generate output name based on frameworks
  const docsetName = frameworks.length === 1
    ? `Apple_${frameworksDisplay[0]}_Reference.docset`
    : `Apple_Test_Reference.docset`;

  const targetDocset = join(outputDir, docsetName);

  console.log(`Source: ${sourceDocset}`);
  console.log(`Extracting frameworks: ${frameworksDisplay.join(', ')}`);
  console.log(`Target: ${targetDocset}\n`);

  // Ensure output directory exists
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  // Clean up existing target
  if (existsSync(targetDocset)) {
    console.log('Removing existing target docset...');
    rmSync(targetDocset, { recursive: true });
  }

  // Create directory structure
  console.log('Creating directory structure...');
  const targetResources = join(targetDocset, 'Contents/Resources');
  const targetDocuments = join(targetResources, 'Documents');
  const targetFs = join(targetDocuments, 'fs');
  mkdirSync(targetFs, { recursive: true });

  // Copy static files
  console.log('Copying static files...');
  const sourceDocuments = join(sourceDocset, 'Contents/Resources/Documents');

  // Copy Info.plist if exists
  const infoPlist = join(sourceDocset, 'Contents/Info.plist');
  if (existsSync(infoPlist)) {
    mkdirSync(join(targetDocset, 'Contents'), { recursive: true });
    copyFileSync(infoPlist, join(targetDocset, 'Contents/Info.plist'));
  }

  // Copy version.plist and Resources
  copyFileSync(join(sourceDocuments, 'version.plist'), join(targetDocuments, 'version.plist'));
  cpSync(join(sourceDocuments, 'Resources'), join(targetDocuments, 'Resources'), { recursive: true });

  // Open source databases
  console.log('Opening source databases...');
  const sourceIndex = new Database(join(sourceDocset, 'Contents/Resources/docSet.dsidx'), { readonly: true });
  const sourceCache = new Database(join(sourceDocuments, 'cache.db'), { readonly: true });

  // Build query for multiple frameworks
  const frameworkConditions = frameworks.map(f => `path LIKE '%/documentation/${f}%'`).join(' OR ');

  console.log('Querying framework entries...');
  const entries = sourceIndex.prepare(`
    SELECT id, name, type, path
    FROM searchIndex
    WHERE ${frameworkConditions}
  `).all() as Array<{ id: number; name: string; type: string; path: string }>;

  console.log(`Found ${entries.length} entries`);

  // Extract request keys and generate UUIDs
  console.log('Generating UUIDs for entries...');
  const uuids = new Set<string>();
  const requestKeyPattern = /request_key=(l[sc]\/[^#]+)/;

  for (const entry of entries) {
    const match = entry.path.match(requestKeyPattern);
    if (match) {
      const requestKey = decodeURIComponent(match[1]);
      try {
        const uuid = generateUuid(requestKey);
        uuids.add(uuid);
      } catch {
        // Skip invalid request keys
      }
    }
  }

  console.log(`Generated ${uuids.size} unique UUIDs`);

  // Get refs for these UUIDs
  console.log('Looking up cache refs...');
  const uuidArray = Array.from(uuids);
  const dataIds = new Set<number>();
  const refs: Array<{ uuid: string; data_id: number; offset: number; length: number }> = [];

  // Query in batches to avoid SQLite variable limit
  const batchSize = 500;
  for (let i = 0; i < uuidArray.length; i += batchSize) {
    const batch = uuidArray.slice(i, i + batchSize);
    const placeholders = batch.map(() => '?').join(',');
    const stmt = sourceCache.prepare(`
      SELECT uuid, data_id, offset, length
      FROM refs
      WHERE uuid IN (${placeholders})
    `);
    const results = stmt.all(...batch) as typeof refs;
    for (const ref of results) {
      refs.push(ref);
      dataIds.add(ref.data_id);
    }
  }

  console.log(`Found ${refs.length} cache refs across ${dataIds.size} data files`);

  // Copy needed fs files
  console.log('Copying fs data files...');
  const sourceFs = join(sourceDocuments, 'fs');
  for (const dataId of dataIds) {
    const filename = String(dataId);
    const sourcePath = join(sourceFs, filename);
    const targetPath = join(targetFs, filename);
    if (existsSync(sourcePath)) {
      copyFileSync(sourcePath, targetPath);
    }
  }

  // Create target databases
  console.log('Creating target searchIndex...');
  const targetIndex = new Database(join(targetResources, 'docSet.dsidx'));
  targetIndex.exec(`
    CREATE TABLE searchIndex (
      id INTEGER PRIMARY KEY,
      name TEXT,
      type TEXT,
      path TEXT
    );
    CREATE INDEX idx_searchIndex_type ON searchIndex(type);
    CREATE INDEX idx_searchIndex_name ON searchIndex(name);
  `);

  const insertIndex = targetIndex.prepare('INSERT INTO searchIndex (id, name, type, path) VALUES (?, ?, ?, ?)');
  const insertMany = targetIndex.transaction((entryList: typeof entries) => {
    for (const entry of entryList) {
      insertIndex.run(entry.id, entry.name, entry.type, entry.path);
    }
  });
  insertMany(entries);
  targetIndex.close();

  console.log('Creating target cache.db...');
  const targetCache = new Database(join(targetDocuments, 'cache.db'));

  // Copy schema from source
  targetCache.exec(`
    CREATE TABLE metadata (
      row_id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL,
      value BLOB NOT NULL,
      UNIQUE(key) ON CONFLICT REPLACE
    );
    CREATE TABLE refs (
      row_id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      uuid TEXT NOT NULL,
      data_id INTEGER NOT NULL,
      offset INTEGER NOT NULL,
      length INTEGER NOT NULL,
      UNIQUE(uuid) ON CONFLICT REPLACE
    );
    CREATE TABLE data (
      row_id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      data BLOB,
      is_compressed INTEGER NOT NULL
    );
    CREATE INDEX refs_index_0 ON refs(uuid);
    CREATE INDEX dash_data_id ON refs(data_id);
    CREATE INDEX dash_data_row_id ON data(row_id);
  `);

  // Copy metadata
  const metadata = sourceCache.prepare('SELECT key, value FROM metadata').all() as Array<{ key: string; value: Buffer }>;
  const insertMeta = targetCache.prepare('INSERT INTO metadata (key, value) VALUES (?, ?)');
  for (const m of metadata) {
    insertMeta.run(m.key, m.value);
  }

  // Insert refs
  const insertRef = targetCache.prepare('INSERT INTO refs (uuid, data_id, offset, length) VALUES (?, ?, ?, ?)');
  const insertRefs = targetCache.transaction((refList: typeof refs) => {
    for (const ref of refList) {
      insertRef.run(ref.uuid, ref.data_id, ref.offset, ref.length);
    }
  });
  insertRefs(refs);

  // Create empty data entries for the data_ids we reference (they're read from fs/)
  const insertData = targetCache.prepare('INSERT INTO data (row_id, data, is_compressed) VALUES (?, NULL, 1)');
  for (const dataId of dataIds) {
    insertData.run(dataId);
  }

  targetCache.close();
  sourceCache.close();
  sourceIndex.close();

  // Print summary
  const fsFiles = readdirSync(targetFs).length;
  console.log(`\n✓ Test docset created successfully!`);
  console.log(`  Location: ${targetDocset}`);
  console.log(`  Frameworks: ${frameworksDisplay.join(', ')}`);
  console.log(`  Entries: ${entries.length}`);
  console.log(`  Cache refs: ${refs.length}`);
  console.log(`  Data files: ${fsFiles}`);
}

main().catch(console.error);
