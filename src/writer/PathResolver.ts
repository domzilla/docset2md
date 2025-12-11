import { join, dirname, basename } from 'node:path';

export class PathResolver {
  private outputDir: string;

  constructor(outputDir: string) {
    this.outputDir = outputDir;
  }

  /**
   * Convert a request key to an output file path.
   * e.g., "ls/documentation/accelerate/vdsp" -> "Swift/Accelerate/vDSP.md"
   */
  resolveFilePath(requestKey: string, language: 'swift' | 'objc', name: string): string {
    const langDir = language === 'swift' ? 'Swift' : 'Objective-C';

    // Extract path after "documentation/"
    const match = requestKey.match(/l[sc]\/documentation\/(.+)/);
    if (!match) {
      return join(this.outputDir, langDir, this.sanitizeFileName(name) + '.md');
    }

    const docPath = match[1];
    const parts = docPath.split('/');

    // Capitalize framework name
    if (parts.length > 0) {
      parts[0] = this.capitalizeFramework(parts[0]);
    }

    // Use the entry name for the filename (last part)
    const fileName = this.sanitizeFileName(name) + '.md';

    if (parts.length === 1) {
      // Framework root
      return join(this.outputDir, langDir, parts[0], '_index.md');
    }

    // Build path: Framework/path/to/item.md
    const dirParts = parts.slice(0, -1);
    return join(this.outputDir, langDir, ...dirParts, fileName);
  }

  /**
   * Resolve directory path for a framework.
   */
  resolveFrameworkDir(framework: string, language: 'swift' | 'objc'): string {
    const langDir = language === 'swift' ? 'Swift' : 'Objective-C';
    return join(this.outputDir, langDir, this.capitalizeFramework(framework));
  }

  /**
   * Get relative path from one doc to another for linking.
   */
  getRelativePath(fromPath: string, toPath: string): string {
    const fromDir = dirname(fromPath);
    const toDir = dirname(toPath);

    if (fromDir === toDir) {
      return './' + basename(toPath);
    }

    // Calculate relative path
    const fromParts = fromDir.split('/').filter(p => p);
    const toParts = toDir.split('/').filter(p => p);

    let commonLength = 0;
    for (let i = 0; i < Math.min(fromParts.length, toParts.length); i++) {
      if (fromParts[i] === toParts[i]) {
        commonLength++;
      } else {
        break;
      }
    }

    const upCount = fromParts.length - commonLength;
    const downParts = toParts.slice(commonLength);

    const relativeParts = [
      ...Array(upCount).fill('..'),
      ...downParts,
      basename(toPath),
    ];

    return relativeParts.join('/');
  }

  /**
   * Sanitize a string for use as a filename.
   */
  sanitizeFileName(name: string): string {
    // Remove or replace invalid characters
    let sanitized = name
      .replace(/[<>:"/\\|?*]/g, '_')
      .replace(/\s+/g, '_')
      .replace(/__+/g, '_')
      .replace(/^_+|_+$/g, '');

    // Handle special method signatures
    if (sanitized.includes('(')) {
      // Simplify method signatures: methodName(_ param: Type) -> simplify
      sanitized = sanitized.split('(')[0];
    }

    // Truncate very long names
    if (sanitized.length > 100) {
      sanitized = sanitized.substring(0, 100);
    }

    // Ensure non-empty
    if (!sanitized) {
      sanitized = 'unnamed';
    }

    return sanitized;
  }

  /**
   * Capitalize framework name properly.
   */
  private capitalizeFramework(name: string): string {
    // Common framework name mappings
    const knownFrameworks: Record<string, string> = {
      accelerate: 'Accelerate',
      foundation: 'Foundation',
      uikit: 'UIKit',
      appkit: 'AppKit',
      swiftui: 'SwiftUI',
      corefoundation: 'CoreFoundation',
      coredata: 'CoreData',
      coregraphics: 'CoreGraphics',
      coreanimation: 'CoreAnimation',
      corelocation: 'CoreLocation',
      avfoundation: 'AVFoundation',
      webkit: 'WebKit',
      mapkit: 'MapKit',
      healthkit: 'HealthKit',
      homekit: 'HomeKit',
      cloudkit: 'CloudKit',
      gamekit: 'GameKit',
      spritekit: 'SpriteKit',
      scenekit: 'SceneKit',
      metalkit: 'MetalKit',
      realitykit: 'RealityKit',
      arkit: 'ARKit',
      vision: 'Vision',
      naturallanguage: 'NaturalLanguage',
      createml: 'CreateML',
      coreml: 'CoreML',
      combine: 'Combine',
      swift: 'Swift',
      dispatch: 'Dispatch',
      os: 'os',
      xcode: 'Xcode',
    };

    const lower = name.toLowerCase();
    if (knownFrameworks[lower]) {
      return knownFrameworks[lower];
    }

    // Default: capitalize first letter
    return name.charAt(0).toUpperCase() + name.slice(1);
  }
}
