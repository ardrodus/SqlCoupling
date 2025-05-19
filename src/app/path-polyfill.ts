/**
 * Path polyfill for Angular
 * 
 * This module provides a consistent implementation of path operations
 * that works in both browser and Node.js environments
 */
import * as pathBrowserify from 'path-browserify';

// Create a path object that works consistently in browser environments
export const path = {
  // Path separator - use forward slash for consistency in browser environments
  sep: '/',
  
  // Windows path separator for compatibility
  win32: {
    sep: '\\'
  },
  
  // Posix path separator for consistency
  posix: {
    sep: '/'
  },
  
  // Path delimiter - semicolon for Windows, colon for POSIX
  // In browser environments, we can't reliably detect the platform, so use a default
  delimiter: ':', // Default to POSIX delimiter
  
  join: (...paths: string[]): string => {
    // Filter out any null or undefined path segments
    const validPaths = paths.filter(p => p != null) as string[];
    return pathBrowserify.join(...validPaths);
  },
  
  dirname: (path: string): string => {
    if (!path) return '.';
    return pathBrowserify.dirname(path);
  },
  
  basename: (path: string, ext?: string): string => {
    if (!path) return '';
    return pathBrowserify.basename(path, ext);
  },
  
  // Normalize path separators to be consistent
  normalize: (path: string): string => {
    if (!path) return '.';
    return pathBrowserify.normalize(path);
  },

  // Extract the extension from a path
  extname: (path: string): string => {
    if (!path) return '';
    return pathBrowserify.extname(path);
  },

  // Safe path resolution that works in browser
  resolve: (...paths: string[]): string => {
    // Filter out any null or undefined path segments
    const validPaths = paths.filter(p => p != null) as string[];
    
    // If we have at least one absolute path, use that as the base
    for (let i = validPaths.length - 1; i >= 0; i--) {
      const p = validPaths[i] || '';
      // Check for absolute paths (Windows or Unix style)
      if (p.startsWith('/') || /^[A-Za-z]:/.test(p)) {
        // We found an absolute path, start from here
        return pathBrowserify.join(...validPaths.slice(i));
      }
    }
    
    // If no absolute paths found, just join them
    return pathBrowserify.join(...validPaths);
  },
  
  // A safe method to split a path - handles null path
  split: (path: string): string[] => {
    if (!path) return [];
    // Split by both forward and backward slashes
    return path.split(/[\/\\]/);
  }
};