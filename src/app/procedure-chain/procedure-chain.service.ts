import { Injectable } from '@angular/core';
import { SqlParserService } from '../sql-parser.service';
import { path } from '../path-polyfill';
import { ChainMetrics, DomainMetrics, ProcedureMetrics } from '../shared-types';

export interface ProcedureNode {
  id: string;        // Unique identifier (procedure name)
  name: string;      // Procedure name
  domain: string;    // Domain code (e.g., "OD", "FI")
  filePath: string;  // Path to the SQL file
  calls: string[];   // List of procedures this procedure calls
  level: number;     // Level in the call hierarchy
  isRoot?: boolean;  // Whether this is the root procedure
  isMissing?: boolean; // Whether the procedure file was not found
  calledBy?: string[]; // List of procedures that call this procedure
  metrics?: ProcedureMetrics; // Metrics for this procedure
}

export interface ProcedureCycle {
  procedures: string[];  // Ordered list of procedures in the cycle
  domains: string[];     // List of domains involved in the cycle
  isCrossDomain: boolean; // Whether the cycle spans multiple domains
}

export interface ProcedureChain {
  nodes: ProcedureNode[];
  edges: ProcedureEdge[];
  rootProcedure: string | null;
  cycles: ProcedureCycle[]; // Detected cycles in the procedure chain
  metrics: ChainMetrics; // Metrics for the entire procedure chain
}

export interface ProcedureEdge {
  id: string;
  from: string;
  to: string;
  isCrossDomain: boolean;
}

interface FileCache {
  [path: string]: {
    content: string | null;
    timestamp: number;
  };
}

interface DirectoryCache {
  [path: string]: {
    files: {path: string, content?: string}[];
    timestamp: number;
  };
}

@Injectable({
  providedIn: 'root'
})
export class ProcedureChainService {
  private visitedProcedures = new Set<string>();
  private fileCache: FileCache = {}; // Cache for file contents
  private directoryCache: DirectoryCache = {}; // Cache for directory listings
  private processingProcedures = new Map<string, Promise<void>>(); // Track in-progress procedure parsing
  private cacheExpiryTime = 5 * 60 * 1000; // 5 minutes in milliseconds

  constructor(private sqlParser: SqlParserService) {}

  // Store the selected directory path
  private selectedDirectoryPath: string = '';
  
  /**
   * Set the selected directory path - should be called when user selects a directory
   */
  setSelectedDirectoryPath(dirPath: string): void {
    this.selectedDirectoryPath = dirPath;
    console.log(`Set selected directory path to: ${this.selectedDirectoryPath}`);
  }
  
  /**
   * Clear all caches - can be called for memory cleanup or debugging
   */
  public clearCaches(): void {
    this.fileCache = {};
    this.directoryCache = {};
    this.processingProcedures.clear();
    console.log('Cleared all file and directory caches');
  }
  
  /**
   * Check and clean expired cached entries
   */
  private cleanCaches(): void {
    const now = Date.now();
    
    // Clean file cache
    for (const path in this.fileCache) {
      if (now - this.fileCache[path].timestamp > this.cacheExpiryTime) {
        delete this.fileCache[path];
      }
    }
    
    // Clean directory cache
    for (const path in this.directoryCache) {
      if (now - this.directoryCache[path].timestamp > this.cacheExpiryTime) {
        delete this.directoryCache[path];
      }
    }
  }
  
  async analyzeProcedureChain(filePath: string): Promise<ProcedureChain> {
    // Reset visited procedures
    this.visitedProcedures.clear();
    // Clean caches before starting a new analysis
    this.cleanCaches();
    console.log(`Analyzing procedure chain starting from: ${filePath}`);
    
    const nodes: ProcedureNode[] = [];
    const edges: ProcedureEdge[] = [];
    const processedNodeIds = new Set<string>();
    
    // Check if Electron API is available
    if (!window.electronAPI) {
      console.warn("Electron API not available - using mock data for development");
      return this.createMockProcedureChain();
    }
    
    // Get filename from path
    console.log(`Processing file: ${filePath}`);
    const fileName = path.basename(filePath);
    console.log(`Extracted filename: ${fileName}`);
    
    // Store the base directory path - either from the selected directory or from the file path
    const baseDirectoryPath = this.selectedDirectoryPath || path.dirname(filePath);
    console.log(`Using base directory path: ${baseDirectoryPath}`);
    
    // Read the initial procedure file
    console.log(`Reading root procedure file: ${filePath}`);
    const sqlContent = await this.readSqlFile(filePath);
    if (!sqlContent) {
      console.error(`Could not read file: ${filePath}`);
      return { 
        nodes, 
        edges, 
        rootProcedure: null, 
        cycles: [],
        metrics: this.createEmptyChainMetrics()
      };
    }
    
    // Extract procedure name and domain from file name
    const procedureInfo = this.extractProcedureInfo(path.basename(filePath));
    
    if (!procedureInfo) {
      console.error(`Invalid procedure file name: ${path.basename(filePath)}`);
      return { 
        nodes, 
        edges, 
        rootProcedure: null, 
        cycles: [],
        metrics: this.createEmptyChainMetrics()
      };
    }
    
    // Process the root procedure and build the chain
    const rootNode: ProcedureNode = {
      id: procedureInfo.name,
      name: procedureInfo.name,
      domain: procedureInfo.domain,
      filePath: filePath,
      calls: [],
      level: 0,
      isRoot: true,
      calledBy: []
    };
    
    // Find all procedure calls in the root procedure
    const directCalls = this.sqlParser.findExecCalls(sqlContent);
    console.log(`Found ${directCalls.length} direct calls in root procedure: ${directCalls.join(', ')}`);
    rootNode.calls = directCalls;
    
    // Add root node to the chain
    nodes.push(rootNode);
    processedNodeIds.add(rootNode.id);
    this.visitedProcedures.add(rootNode.id);
    console.log(`Added root procedure ${rootNode.id} to visited set`);
    
    // Recursively process all called procedures - use the stored base directory path
    console.log(`Starting recursive procedure chain processing from ${rootNode.id}`);
    await this.processCalledProcedures(rootNode, nodes, edges, baseDirectoryPath, processedNodeIds);
    
    // Detect cycles in the procedure chain
    const cycles = this.detectCycles(nodes);
    console.log(`Detected ${cycles.length} cycles in procedure chain`);
    
    // Build the calledBy references - now optimized with an index map
    this.buildCalledByReferences(nodes);
    
    // Calculate metrics for the procedure chain
    const metrics = this.calculateChainMetrics(nodes, edges, cycles);
    console.log('Calculated chain metrics:', metrics);
    
    // Calculate metrics for individual procedures
    this.calculateProcedureMetrics(nodes, edges);
    
    return { 
      nodes, 
      edges,
      rootProcedure: rootNode.id,
      cycles,
      metrics
    };
  }
  

  /**
   * Creates mock data for development/testing when Electron API is not available
   */
  private createMockProcedureChain(): ProcedureChain {
    const nodes: ProcedureNode[] = [];
    const edges: ProcedureEdge[] = [];
    
    // Create mock root node
    const rootNode: ProcedureNode = {
      id: 'FI_TestProcedure_SP',
      name: 'FI_TestProcedure_SP',
      domain: 'FI',
      filePath: '/mnt/c/Sample/Data/FI_TestProcedure_SP.sql',
      calls: ['WI_UpdateInventory_SP', 'FI_UpdateBalance_SP'],
      level: 0,
      isRoot: true,
      calledBy: []
    };
    nodes.push(rootNode);
    
    // Create mock called procedures
    const proc1: ProcedureNode = {
      id: 'WI_UpdateInventory_SP',
      name: 'WI_UpdateInventory_SP',
      domain: 'WI',
      filePath: '/mnt/c/Sample/Data/WI_UpdateInventory_SP.sql',
      calls: ['WI_AdjustStock_SP'],
      level: 1,
      isMissing: false,
      calledBy: ['FI_TestProcedure_SP']
    };
    nodes.push(proc1);
    
    const proc2: ProcedureNode = {
      id: 'FI_UpdateBalance_SP',
      name: 'FI_UpdateBalance_SP',
      domain: 'FI',
      filePath: '/mnt/c/Sample/Data/FI_UpdateBalance_SP.sql',
      calls: [],
      level: 1,
      isMissing: false,
      calledBy: ['FI_TestProcedure_SP']
    };
    nodes.push(proc2);
    
    const proc3: ProcedureNode = {
      id: 'WI_AdjustStock_SP',
      name: 'WI_AdjustStock_SP',
      domain: 'WI',
      filePath: '/mnt/c/Sample/Data/WI_AdjustStock_SP.sql',
      calls: ['MG_NotifyChanges_SP'],
      level: 2,
      isMissing: false,
      calledBy: ['WI_UpdateInventory_SP']
    };
    nodes.push(proc3);
    
    const proc4: ProcedureNode = {
      id: 'MG_NotifyChanges_SP',
      name: 'MG_NotifyChanges_SP',
      domain: 'MG',
      filePath: '/mnt/c/Sample/Data/MG_NotifyChanges_SP.sql',
      calls: [],
      level: 3,
      isMissing: true,
      calledBy: ['WI_AdjustStock_SP']
    };
    nodes.push(proc4);
    
    // Create edges between procedures
    edges.push({
      id: 'edge-FI_TestProcedure_SP-WI_UpdateInventory_SP',
      from: 'FI_TestProcedure_SP',
      to: 'WI_UpdateInventory_SP',
      isCrossDomain: true
    });
    
    edges.push({
      id: 'edge-FI_TestProcedure_SP-FI_UpdateBalance_SP',
      from: 'FI_TestProcedure_SP',
      to: 'FI_UpdateBalance_SP',
      isCrossDomain: false
    });
    
    edges.push({
      id: 'edge-WI_UpdateInventory_SP-WI_AdjustStock_SP',
      from: 'WI_UpdateInventory_SP',
      to: 'WI_AdjustStock_SP',
      isCrossDomain: false
    });
    
    edges.push({
      id: 'edge-WI_AdjustStock_SP-MG_NotifyChanges_SP',
      from: 'WI_AdjustStock_SP',
      to: 'MG_NotifyChanges_SP',
      isCrossDomain: true
    });
    
    // Calculate metrics for individual procedures
    this.calculateProcedureMetrics(nodes, edges);
    
    // Add mock cycles and metrics for testing
    const mockCycles: ProcedureCycle[] = [];
    
    // Calculate chain metrics
    const metrics = this.calculateChainMetrics(nodes, edges, mockCycles);
    
    return {
      nodes,
      edges,
      rootProcedure: 'FI_TestProcedure_SP',
      cycles: mockCycles,
      metrics
    };
  }
  
  /**
   * Creates an empty chain metrics object for error cases
   */
  private createEmptyChainMetrics(): ChainMetrics {
    return {
      maxCallDepth: 0,
      avgCallDepth: 0,
      entryPoints: 0,
      leafNodes: 0,
      domainCouplingScore: 0,
      crossDomainRatio: 0,
      hotspotProcedures: [],
      cyclomaticComplexity: 0,
      domains: []
    };
  }
  
  /**
   * Builds the calledBy references for each procedure node
   */
  private buildCalledByReferences(nodes: ProcedureNode[]): void {
    console.log('Building calledBy references for procedures');
    
    // Initialize calledBy arrays if needed
    for (const node of nodes) {
      if (!node.calledBy) {
        node.calledBy = [];
      }
    }
    
    // Build a map for quick node lookup
    const nodeMap = new Map<string, ProcedureNode>();
    for (const node of nodes) {
      nodeMap.set(node.id, node);
    }
    
    // Populate calledBy arrays
    for (const node of nodes) {
      for (const calledProc of node.calls) {
        const calledNode = nodeMap.get(calledProc);
        if (calledNode) {
          // Ensure calledBy array exists
          if (!calledNode.calledBy) {
            calledNode.calledBy = [];
          }
          
          // Add reference if not already present
          if (!calledNode.calledBy.includes(node.id)) {
            calledNode.calledBy.push(node.id);
          }
        }
      }
    }
  }
  
  private async processCalledProcedures(
    parentNode: ProcedureNode, 
    nodes: ProcedureNode[], 
    edges: ProcedureEdge[],
    basePath: string,
    processedNodeIds = new Set<string>(),
    level = 1
  ): Promise<void> {
    if (!window.electronAPI) return;
    
    console.log(`Processing calls for ${parentNode.name} with ${parentNode.calls.length} direct calls`);
    
    // Always prioritize the selectedDirectoryPath if it's available
    if (this.selectedDirectoryPath) {
      basePath = this.selectedDirectoryPath;
      console.log(`Using selected directory path: ${basePath}`);
    } 
    // If we have a valid basePath parameter, use it
    else if (basePath) {
      console.log(`Using provided basePath parameter: ${basePath}`);
    } 
    // If no basePath, use parent's path as fallback
    else if (parentNode.filePath && !parentNode.filePath.includes('[Virtual]')) {
      basePath = path.dirname(parentNode.filePath);
      console.log(`Using parent's file path directory as fallback: ${basePath}`);
    }
    // Last resort fallback - should never reach here
    else {
      console.error(`ERROR: Missing basePath - using default fallback`);
      // Use a default path that makes sense for your environment
      basePath = `C:\\Sandboxes\\EnterpriseGit\\Source\\Enterprise\\Databases\\Company\\Procs`;
      console.log(`Using default fallback path: ${basePath}`);
    }
    
    // Ensure basePath is not empty
    if (!basePath) {
      console.error(`ERROR: Empty basePath after all fallbacks - using current directory`);
      basePath = ".";
    }
    
    // Group procedure calls by domain to optimize file lookup
    const callsByDomain: { [domain: string]: string[] } = {};
    for (const procName of parentNode.calls) {
      // Skip if the procName is not valid (should be in format XX_Name_SP)
      if (!procName.match(/^[A-Z]{2}_[A-Za-z0-9_]+?_SP$/)) {
        console.warn(`Skipping invalid procedure name: ${procName}`);
        continue;
      }
      
      const procDomain = procName.substring(0, 2);
      if (!callsByDomain[procDomain]) {
        callsByDomain[procDomain] = [];
      }
      callsByDomain[procDomain].push(procName);
    }
    
    // Create all edges first (this doesn't require file IO)
    for (const procName of parentNode.calls) {
      // Skip if invalid format
      if (!procName.match(/^[A-Z]{2}_[A-Za-z0-9_]+?_SP$/)) {
        continue;
      }
      
      // Create edge from parent to this procedure regardless if visited before
      const edgeId = `edge-${parentNode.id}-${procName}`;
      const existingEdge = edges.find(e => e.id === edgeId);
      
      // Extract domain from the procedure name
      const procDomain = procName.substring(0, 2);
      const isCrossDomain = parentNode.domain !== procDomain;
      
      // Always create the edge if it doesn't exist
      if (!existingEdge) {
        edges.push({
          id: edgeId,
          from: parentNode.id,
          to: procName,
          isCrossDomain
        });
      }
    }
    
    // Process nodes by domain (this allows for more efficient directory searching)
    const processingPromises: Promise<void>[] = [];
    
    for (const domain in callsByDomain) {
      const procedureNames = callsByDomain[domain];
      
      // Process all procedures in this domain - we can share directory scanning results
      processingPromises.push(this.processProceduresByDomain(
        parentNode, procedureNames, domain, nodes, edges, basePath, processedNodeIds, level
      ));
    }
    
    // Wait for all domain processing to complete
    await Promise.all(processingPromises);
  }
  
  /**
   * Process a group of procedures in the same domain
   * This optimizes directory scanning by doing it once per domain
   */
  private async processProceduresByDomain(
    parentNode: ProcedureNode,
    procedureNames: string[],
    domain: string,
    nodes: ProcedureNode[],
    edges: ProcedureEdge[],
    basePath: string,
    processedNodeIds: Set<string>,
    level: number
  ): Promise<void> {
    // For each procedure in this domain
    for (const procName of procedureNames) {
      // Skip if we've already processed this node
      if (processedNodeIds.has(procName)) {
        continue;
      }
      
      // Skip further processing if we're already handling this procedure in another call
      if (this.processingProcedures.has(procName)) {
        console.log(`Already processing procedure: ${procName}, waiting for completion`);
        await this.processingProcedures.get(procName);
        continue;
      }
      
      // Create a new promise for this procedure's processing
      const processingPromise = (async () => {
        // Skip further processing if we've already processed this procedure
        if (this.visitedProcedures.has(procName)) {
          console.log(`Already visited procedure: ${procName}, skipping deeper analysis`);
          return;
        }
        
        // Find the SQL file for this procedure
        console.log(`Looking for procedure file: ${procName} in base directory: ${basePath}`);
        const procedureFilePath = await this.findProcedureFile(procName, domain, basePath);
        
        // Ensure we have a filePath, creating a virtual path if needed
        let filePath = procedureFilePath;
        let isMissing = !procedureFilePath;
        
        // If no file path was found, create a virtual file path to ensure it appears in the graph
        if (!filePath) {
          // Create a virtual path based on domain
          filePath = `[Virtual] ${procName}.sql`;
          isMissing = true;
          console.log(`Created virtual file for dependency graph: ${filePath}`);
        }
        
        // Create node for this procedure - always add to graph even if missing
        const node: ProcedureNode = {
          id: procName,
          name: procName,
          domain: domain,
          filePath: filePath,
          calls: [],
          level,
          isMissing: isMissing
        };
        
        // Add node to the chain
        nodes.push(node);
        processedNodeIds.add(procName);
        this.visitedProcedures.add(procName);
        
        // Process the file's calls recursively - always try, even if "missing"
        try {
          // Determine if we need to create synthetic content
          let sqlContent: string | null = null;
          
          // Handle virtual or missing files by creating synthetic content
          if (!filePath || filePath.includes('[Virtual]') || isMissing) {
            // For virtual files, create synthetic content with no calls
            sqlContent = `
-- SYNTHETIC CONTENT FOR ${procName}
CREATE PROCEDURE ${procName}
AS
BEGIN
  -- Placeholder for virtual file
  SELECT 1;
END
            `;
          } else {
            // For real files, read the content
            sqlContent = await this.readSqlFile(filePath);
          }
              
          if (sqlContent) {
            // Extract all procedure calls from the SQL content
            const calls = this.sqlParser.findExecCalls(sqlContent);
            node.calls = calls;
            
            // Always use the same base directory for consistency
            let searchDir = basePath;
            
            // Recursively process called procedures with increased level
            if (calls.length > 0) {
              await this.processCalledProcedures(node, nodes, edges, searchDir, processedNodeIds, level + 1);
            }
          }
        } catch (error) {
          console.error(`Error processing calls for ${procName}:`, error);
          // Even if there's an error, we'll keep the node in the graph as "missing"
          node.isMissing = true;
        }
      })();
      
      // Store the promise in the processingProcedures map
      this.processingProcedures.set(procName, processingPromise);
      
      // Wait for the processing to complete
      await processingPromise;
      
      // Remove the procedure from the processingProcedures map
      this.processingProcedures.delete(procName);
    }
  }
  
  /**
   * Find the actual file corresponding to a stored procedure on the filesystem
   * Looks for a SQL file matching the procedure name in the given base directory
   */
  private async findProcedureFile(procedureName: string, domain: string, basePath: string): Promise<string | null> {
    // Mock data for testing when Electron API is not available
    if (!window.electronAPI) {
      return this.getMockProcedureFilePath(procedureName);
    }
    
    // First, determine which directory to search in
    let searchPath = basePath;
    
    // Always prioritize the selectedDirectoryPath if available
    if (this.selectedDirectoryPath) {
      searchPath = this.selectedDirectoryPath;
    } else if (!basePath || basePath === '[Virtual]') {
      return `[Virtual] ${procedureName}.sql`;
    }
    
    // Ensure procedure name has .sql extension
    let expectedFileName = procedureName;
    if (!expectedFileName.toLowerCase().endsWith('.sql')) {
      expectedFileName += '.sql';
    }
    
    try {
      // Check cache first
      const cacheKey = `${searchPath}:${procedureName}`;
      if (this.fileCache[cacheKey]) {
        // If we have a cached result for this file
        const cachedResult = this.fileCache[cacheKey];
        if (Date.now() - cachedResult.timestamp < this.cacheExpiryTime) {
          // Return cached file path if the cache is still valid
          if (cachedResult.content !== null) {
            return searchPath; // We already know this file exists and its content is cached
          } else {
            return `[Virtual] ${procedureName}.sql`; // We know this file doesn't exist
          }
        }
      }
      
      // Check directory cache
      if (this.directoryCache[searchPath]) {
        const cachedDir = this.directoryCache[searchPath];
        if (Date.now() - cachedDir.timestamp < this.cacheExpiryTime) {
          // Use the cached directory listing
          const filesData = cachedDir.files;
          
          // Look for exact file name match first
          const exactMatch = filesData.find(f => 
            path.basename(f.path).toLowerCase() === expectedFileName.toLowerCase());
          
          if (exactMatch) {
            return exactMatch.path;
          }
          
          // If no exact match found, look for other SQL files that contain the procedure name
          const sqlFiles = filesData.filter(f => 
            f.path.toLowerCase().endsWith('.sql') && 
            path.basename(f.path).toLowerCase().includes(procedureName.toLowerCase()));
          
          if (sqlFiles.length > 0) {
            return sqlFiles[0].path;
          }
        }
      }
      
      // Create the full expected file path 
      const exactFilePath = path.join(searchPath, expectedFileName);
      
      // First attempt: Try to find the exact file in the specified directory
      try {
        const { filesData } = await window.electronAPI.readDirectory(searchPath);
        
        // Cache the directory contents
        this.directoryCache[searchPath] = {
          files: filesData,
          timestamp: Date.now()
        };
        
        // Look for exact file name match first
        const exactMatch = filesData.find(f => 
          path.basename(f.path).toLowerCase() === expectedFileName.toLowerCase());
        
        if (exactMatch) {
          return exactMatch.path;
        }
        
        // If no exact match found, look for other SQL files that contain the procedure name
        // but still prioritize exact names
        const sqlFiles = filesData.filter(f => 
          f.path.toLowerCase().endsWith('.sql') && 
          path.basename(f.path).toLowerCase().includes(procedureName.toLowerCase()));
        
        if (sqlFiles.length > 0) {
          return sqlFiles[0].path;
        }
      } catch (err) {
        console.warn(`Error reading directory ${searchPath}`);
      }
      
      // We'll skip the subdirectory check to optimize performance in most cases
      // If domain-specific directories are important, they should be selected directly
      
      // If we can't find the file, create a virtual file and cache the result
      this.fileCache[cacheKey] = {
        content: null, // File doesn't exist
        timestamp: Date.now()
      };
      
      return `[Virtual] ${procedureName}.sql`;
      
    } catch (err) {
      // If we encounter an error, create a virtual file
      return `[Virtual] ${procedureName}.sql`;
    }
  }
  
  /**
   * Simple directory search for a specific file
   * Looks for an exact match of the file name within a directory
   */
  private async searchDirectoryForFile(dirPath: string, fileName: string): Promise<string | null> {
    if (!window.electronAPI) return null;
    
    try {
      const { filesData } = await window.electronAPI.readDirectory(dirPath);
      const match = filesData.find(f => path.basename(f.path).toLowerCase() === fileName.toLowerCase());
      
      if (match) {
        console.log(`Found ${fileName} in ${dirPath}`);
        return match.path;
      }
    } catch (err) {
      console.error(`Error searching in directory ${dirPath}:`, err);
    }
    
    return null;
  }
  
  /**
   * Returns mock file paths for test procedures
   */
  private getMockProcedureFilePath(procedureName: string): string | null {
    // Map of procedure names to their mock file paths
    const mockFilePaths: {[key: string]: string} = {
      'FI_TestProcedure_SP': '/mnt/c/Sample/Data/FI_TestProcedure_SP.sql',
      'WI_UpdateInventory_SP': '/mnt/c/Sample/Data/WI_UpdateInventory_SP.sql',
      'FI_UpdateBalance_SP': '/mnt/c/Sample/Data/FI_UpdateBalance_SP.sql',
      'WI_AdjustStock_SP': '/mnt/c/Sample/Data/WI_AdjustStock_SP.sql',
      'MG_NotifyChanges_SP': null as any // This one will be a "missing" procedure
    };
    
    // Return the mock file path if it exists in our map, or null for unknown procedures
    return mockFilePaths[procedureName] || 
           // For procedures not in our map, generate a path if it follows the XX_Name_SP pattern
           (procedureName.match(/^[A-Z]{2}_[A-Za-z0-9_]+?_SP$/) ? 
             `/mnt/c/Sample/Data/${procedureName}.sql` : null);
  }
  
  /**
   * Read the content of a SQL file directly from the filesystem
   * Now with caching to improve performance
   */
  private async readSqlFile(filePath: string): Promise<string | null> {
    if (!window.electronAPI) {
      return this.getMockSqlContent(filePath);
    }
    
    // Handle virtual files
    if (filePath.includes('[Virtual]')) {
      const procedureName = path.basename(filePath.replace('[Virtual] ', '').replace('.sql', ''));
      return this.getMockSqlContent(filePath);
    }
    
    // Check cache first
    if (this.fileCache[filePath]) {
      const cachedFile = this.fileCache[filePath];
      if (Date.now() - cachedFile.timestamp < this.cacheExpiryTime) {
        return cachedFile.content;
      }
    }
    
    try {
      // Get the directory and filename
      const dirPath = path.dirname(filePath);
      const fileName = path.basename(filePath);
      
      let content: string | null = null;
      
      // Check if dirPath is empty or invalid
      if (!dirPath || dirPath === '.' || dirPath === '/') {
        // Use the selectedDirectoryPath if available
        if (this.selectedDirectoryPath) {
          // Check directory cache first
          if (this.directoryCache[this.selectedDirectoryPath]) {
            const cachedDir = this.directoryCache[this.selectedDirectoryPath];
            if (Date.now() - cachedDir.timestamp < this.cacheExpiryTime) {
              // Use the cached directory listing
              const filesData = cachedDir.files;
              const exactMatch = filesData.find(f => 
                path.basename(f.path).toLowerCase() === fileName.toLowerCase());
              
              if (exactMatch && exactMatch.content) {
                content = exactMatch.content;
              }
            }
          }
          
          // If not in cache, read from filesystem
          if (content === null) {
            const { filesData } = await window.electronAPI.readDirectory(this.selectedDirectoryPath);
            
            // Cache the directory
            this.directoryCache[this.selectedDirectoryPath] = {
              files: filesData,
              timestamp: Date.now()
            };
            
            // Look for an exact file name match
            const exactMatch = filesData.find(f => 
              path.basename(f.path).toLowerCase() === fileName.toLowerCase());
            
            if (exactMatch && exactMatch.content) {
              content = exactMatch.content;
            }
          }
        }
      } else {
        // Check directory cache first
        if (this.directoryCache[dirPath]) {
          const cachedDir = this.directoryCache[dirPath];
          if (Date.now() - cachedDir.timestamp < this.cacheExpiryTime) {
            // Use the cached directory listing
            const filesData = cachedDir.files;
            const exactMatch = filesData.find(f => 
              path.basename(f.path).toLowerCase() === fileName.toLowerCase());
            
            if (exactMatch && exactMatch.content) {
              content = exactMatch.content;
            }
          }
        }
        
        // If not in cache, read from filesystem
        if (content === null) {
          const { filesData } = await window.electronAPI.readDirectory(dirPath);
          
          // Cache the directory
          this.directoryCache[dirPath] = {
            files: filesData,
            timestamp: Date.now()
          };
          
          // Look for an exact file name match
          const exactMatch = filesData.find(f => 
            path.basename(f.path).toLowerCase() === fileName.toLowerCase());
          
          if (exactMatch && exactMatch.content) {
            content = exactMatch.content;
          }
        }
      }
      
      // Cache the file content result
      this.fileCache[filePath] = {
        content,
        timestamp: Date.now()
      };
      
      return content;
      
    } catch (err) {
      // Cache the error result
      this.fileCache[filePath] = {
        content: null,
        timestamp: Date.now()
      };
      
      return null;
    }
  }
  
  /**
   * Returns mock SQL content for testing or for procedures where files can't be found
   */
  private getMockSqlContent(filePath: string): string {
    // Extract procedure name from file path
    const fileName = path.basename(filePath);
    const procedureName = fileName.replace(/\.sql$/i, '');
    
    // Extract domain from procedure name if possible
    const domainMatch = procedureName.match(/^([A-Z]{2})_/);
    const domain = domainMatch ? domainMatch[1] : 'XX';
    
    // Check if we have specific predefined content for some procedures
    // Add special cases for known procedures that have specific dependencies
    if (procedureName === 'OD_CalcOrder_SP') {
      return `
CREATE PROCEDURE OD_CalcOrder_SP
AS
BEGIN
    -- This is a synthetic procedure for OD_CalcOrder_SP
    -- It calls other procedures in the CalcOrder chain
    EXEC OD_CalcOrder_PopulateOrderCalcTables_SP;
    EXEC OD_CalcOrder_CreateFuelLoads_SP;
    EXEC OD_CalcOrder_CreateCustomerInvoiceFees_SP; 
    EXEC OD_CalcOrder_CalcFuelOrders_SP;
    EXEC OD_CalcOrder_CalcWhOrders_SP;
    EXEC OD_CalcOrder_CalcFuelOrders_UpdatePrices_SP;
    EXEC OD_CalcOrder_CalcWhOrders_UpdatePrices_SP;
    EXEC OD_CalcOrder_UpdateOrders_SP;
    EXEC OD_CalcOrder_CalcOrderInvoiceFees_SP;
    EXEC OD_CalcOrder_OrdTotal_SP;
    EXEC OD_CalcOrder_UpdateBuybackRecStatus_SP;
END
      `;
    } else if (procedureName === 'FI_TestProcedure_SP') {
      return `
CREATE PROCEDURE FI_TestProcedure_SP
AS
BEGIN
    -- This is a mock procedure for testing
    -- It calls other procedures
    EXEC WI_UpdateInventory_SP;
    EXEC FI_UpdateBalance_SP;
END
      `;
    } else if (procedureName === 'WI_UpdateInventory_SP') {
      return `
CREATE PROCEDURE WI_UpdateInventory_SP
AS
BEGIN
    -- Update warehouse inventory
    -- This calls another procedure
    EXEC WI_AdjustStock_SP;
END
      `;
    } else if (procedureName === 'FI_UpdateBalance_SP') {
      return `
CREATE PROCEDURE FI_UpdateBalance_SP
AS
BEGIN
    -- Update financial balance
    -- This doesn't call any other procedures
    PRINT 'Updating balance';
END
      `;
    } else if (procedureName === 'WI_AdjustStock_SP') {
      return `
CREATE PROCEDURE WI_AdjustStock_SP
AS
BEGIN
    -- Adjust stock levels
    -- Call notification system
    EXEC MG_NotifyChanges_SP;
END
      `;
    } else if (procedureName.startsWith('OD_CalcOrder_')) {
      // Special handling for any CalcOrder sub-procedures
      return `
CREATE PROCEDURE ${procedureName}
AS
BEGIN
    -- This is a synthetic procedure for ${procedureName}
    -- It's part of the CalcOrder procedure chain in the OrderDesk domain
    -- Typically these procedures would call other related procedures
    
    -- Add some domain-specific calls based on the procedure name
    ${this.generateSyntheticCalls(procedureName, domain)}
END
      `;
    } else {
      // Default mock content for any other file
      return `
CREATE PROCEDURE ${procedureName}
AS
BEGIN
    -- This is a synthetic procedure for ${procedureName}
    -- It was not found in the filesystem but is referenced by other procedures
    
    -- We've added some generic calls based on the domain and name
    ${this.generateSyntheticCalls(procedureName, domain)}
END
      `;
    }
  }
  
  /**
   * Generates synthetic procedure calls for mock content
   * This helps create more realistic dependencies in the graph
   */
  private generateSyntheticCalls(procedureName: string, domain: string): string {
    const calls: string[] = [];
    
    // Add some domain-specific calls based on common patterns
    if (procedureName.includes('Calc')) {
      calls.push(`-- Calculation procedures often call validation and logging procedures\nEXEC ${domain}_ValidateData_SP;\nEXEC LI_LogActivity_SP;`);
    }
    
    if (procedureName.includes('Update')) {
      calls.push(`-- Update procedures often call transaction and audit procedures\nEXEC ${domain}_CreateAuditTrail_SP;\nEXEC LI_CommitTransaction_SP;`);
    }
    
    if (procedureName.includes('Create')) {
      calls.push(`-- Creation procedures often call initialization procedures\nEXEC ${domain}_InitializeData_SP;\nEXEC LI_AssignIdentifier_SP;`);
    }
    
    if (procedureName.includes('Validate')) {
      calls.push(`-- Validation procedures often call error handling procedures\nEXEC LI_RaiseError_SP;\nEXEC LI_LogMessage_SP;`);
    }
    
    // Add a generic error handling call that most procedures would have
    if (!procedureName.includes('Error') && Math.random() > 0.5) {
      calls.push(`-- Most procedures have error handling\nEXEC LI_HandleError_SP;`);
    }
    
    // Add a realistic 'execute as caller' statement that many procedures have
    calls.push(`-- Many procedures include security context management\n-- EXECUTE AS CALLER\n-- REVERT`);
    
    // Return the generated calls or a placeholder if no calls were generated
    return calls.length > 0 ? 
      calls.join('\n\n') : 
      '-- No synthetic procedure calls generated for this procedure\nPRINT \'Executing procedure\';';
  }
  
  /**
   * Calculates metrics for the entire procedure chain
   */
  private calculateChainMetrics(
    nodes: ProcedureNode[], 
    edges: ProcedureEdge[], 
    cycles: ProcedureCycle[]
  ): ChainMetrics {
    console.log('Calculating chain metrics');
    
    // Find maximum call depth
    const maxCallDepth = Math.max(...nodes.map(n => n.level));
    
    // Calculate average call depth (excluding root)
    const nonRootNodes = nodes.filter(n => !n.isRoot);
    const avgCallDepth = nonRootNodes.length > 0 
      ? nonRootNodes.reduce((sum, node) => sum + node.level, 0) / nonRootNodes.length
      : 0;
    
    // Count entry points (procedures with no callers)
    const entryPoints = nodes.filter(n => !n.calledBy || n.calledBy.length === 0).length;
    
    // Count leaf nodes (procedures that don't call others)
    const leafNodes = nodes.filter(n => n.calls.length === 0).length;
    
    // Calculate cross-domain ratio
    const crossDomainCalls = edges.filter(e => e.isCrossDomain).length;
    const crossDomainRatio = edges.length > 0 ? crossDomainCalls / edges.length : 0;
    
    // Find hotspot procedures (most frequently called)
    const procedureCounts = new Map<string, number>();
    for (const node of nodes) {
      if (node.calledBy && node.calledBy.length > 0) {
        procedureCounts.set(node.id, node.calledBy.length);
      } else {
        procedureCounts.set(node.id, 0);
      }
    }
    
    // Sort procedures by caller count (most called first)
    const sortedProcedures = [...procedureCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5) // Take top 5
      .map(entry => entry[0]);
    
    // Calculate domain-specific metrics
    const domainMap = new Map<string, DomainMetrics>();
    
    // Initialize domain metrics
    for (const node of nodes) {
      if (!domainMap.has(node.domain)) {
        domainMap.set(node.domain, {
          name: node.domain,
          procedureCount: 0,
          inboundCalls: 0,
          outboundCalls: 0,
          internalCalls: 0,
          couplingScore: 0
        });
      }
      
      // Increment procedure count for this domain
      const domainMetrics = domainMap.get(node.domain)!;
      domainMetrics.procedureCount++;
    }
    
    // Calculate call counts for each domain
    for (const edge of edges) {
      // Get source and target nodes
      const sourceNode = nodes.find(n => n.id === edge.from);
      const targetNode = nodes.find(n => n.id === edge.to);
      
      if (sourceNode && targetNode) {
        if (sourceNode.domain === targetNode.domain) {
          // Internal call
          const domainMetrics = domainMap.get(sourceNode.domain)!;
          domainMetrics.internalCalls++;
        } else {
          // Cross-domain call
          const sourceDomainMetrics = domainMap.get(sourceNode.domain)!;
          const targetDomainMetrics = domainMap.get(targetNode.domain)!;
          
          sourceDomainMetrics.outboundCalls++;
          targetDomainMetrics.inboundCalls++;
        }
      }
    }
    
    // Calculate coupling scores for each domain
    for (const [domain, metrics] of domainMap.entries()) {
      const totalCalls = metrics.internalCalls + metrics.outboundCalls;
      metrics.couplingScore = totalCalls > 0 
        ? (metrics.outboundCalls / totalCalls) * 100
        : 0;
    }
    
    // Calculate overall domain coupling score (weighted average)
    let totalProcedures = 0;
    let weightedCouplingSum = 0;
    
    for (const metrics of domainMap.values()) {
      totalProcedures += metrics.procedureCount;
      weightedCouplingSum += metrics.couplingScore * metrics.procedureCount;
    }
    
    const domainCouplingScore = totalProcedures > 0
      ? weightedCouplingSum / totalProcedures
      : 0;
    
    // Calculate cyclomatic complexity (V(G) = E - N + 2P)
    // Where E is edges, N is nodes, P is connected components (1 in our case)
    const cyclomaticComplexity = edges.length - nodes.length + 2;
    
    return {
      maxCallDepth,
      avgCallDepth: parseFloat(avgCallDepth.toFixed(2)),
      entryPoints,
      leafNodes,
      domainCouplingScore: parseFloat(domainCouplingScore.toFixed(2)),
      crossDomainRatio: parseFloat(crossDomainRatio.toFixed(2)),
      hotspotProcedures: sortedProcedures,
      cyclomaticComplexity: Math.max(1, cyclomaticComplexity), // Ensure minimum of 1
      domains: Array.from(domainMap.values())
    };
  }
  
  /**
   * Calculates metrics for individual procedures
   */
  private calculateProcedureMetrics(nodes: ProcedureNode[], edges: ProcedureEdge[]): void {
    console.log('Calculating procedure-level metrics');
    
    // Build a map for quick node lookup
    const nodeMap = new Map<string, ProcedureNode>();
    for (const node of nodes) {
      nodeMap.set(node.id, node);
    }
    
    // Find call counts for all procedures (to identify critical procedures)
    const callCounts = new Map<string, number>();
    for (const node of nodes) {
      callCounts.set(node.id, node.calledBy?.length || 0);
    }
    
    // Calculate the threshold for "critical" procedures (top 10% or at least 3 calls)
    const sortedCounts = [...callCounts.values()].sort((a, b) => b - a);
    const criticalThreshold = Math.max(
      sortedCounts.length > 10 ? sortedCounts[Math.floor(sortedCounts.length * 0.1)] : 0,
      3 // Minimum threshold
    );
    
    // Calculate metrics for each procedure
    for (const node of nodes) {
      // Calculate maximum call depth from this procedure
      const callDepth = this.calculateMaxCallDepthFrom(node, nodeMap);
      
      // Count callers and callees
      const callerCount = node.calledBy?.length || 0;
      const calleeCount = node.calls.length;
      
      // Calculate complexity score based on call patterns and structure
      // Formula: (calleeCount * 2) + callerCount + (node.level * 0.5)
      const complexityScore = (calleeCount * 2) + callerCount + (node.level * 0.5);
      
      // Determine if this is a critical procedure
      const isCritical = callerCount >= criticalThreshold;
      
      // Set metrics on the node
      node.metrics = {
        name: node.name,
        callDepth,
        callerCount,
        calleeCount,
        complexityScore: parseFloat(complexityScore.toFixed(2)),
        isCritical
      };
    }
  }
  
  /**
   * Calculates the maximum call depth from a given procedure
   */
  private calculateMaxCallDepthFrom(
    node: ProcedureNode, 
    nodeMap: Map<string, ProcedureNode>,
    visited: Set<string> = new Set()
  ): number {
    // Prevent cycles
    if (visited.has(node.id)) return 0;
    visited.add(node.id);
    
    // If no calls, depth is 0
    if (node.calls.length === 0) return 0;
    
    // Find max depth of all called procedures
    let maxDepth = 0;
    for (const calledId of node.calls) {
      const calledNode = nodeMap.get(calledId);
      if (calledNode) {
        const depth = 1 + this.calculateMaxCallDepthFrom(calledNode, nodeMap, new Set(visited));
        maxDepth = Math.max(maxDepth, depth);
      }
    }
    
    return maxDepth;
  }
  
  private extractProcedureInfo(fileName: string): { name: string, domain: string } | null {
    const match = fileName.match(/^([A-Z]{2})_([A-Za-z0-9_]+?_SP)(?:\.sql)?$/i);
    if (match && match[1] && match[2]) {
      const domain = match[1].toUpperCase();
      const name = `${domain}_${match[2]}`;
      return { name, domain };
    }
    return null;
  }
  
  /**
   * Detects cycles in the procedure chain using a depth-first search algorithm
   * @param nodes List of procedure nodes
   * @returns Array of detected cycles
   */
  private detectCycles(nodes: ProcedureNode[]): ProcedureCycle[] {
    console.log(`Detecting cycles among ${nodes.length} procedures`);
    
    // Build a map of procedure name to node for quick lookup
    const nodeMap = new Map<string, ProcedureNode>();
    for (const node of nodes) {
      nodeMap.set(node.id, node);
    }
    
    // Track all detected cycles
    const allCycles: ProcedureCycle[] = [];
    
    // Track global visited nodes to avoid redundant searches
    const globalVisited = new Set<string>();
    
    // For each node, perform DFS to detect cycles
    for (const node of nodes) {
      if (globalVisited.has(node.id)) continue;
      
      // Track visited nodes in current DFS path
      const visited = new Set<string>();
      // Track the current path
      const path: string[] = [];
      
      this.dfsDetectCycles(node.id, nodeMap, visited, path, allCycles, globalVisited);
    }
    
    return allCycles;
  }
  
  /**
   * Helper method for cycle detection using depth-first search
   */
  private dfsDetectCycles(
    currentId: string,
    nodeMap: Map<string, ProcedureNode>,
    visited: Set<string>,
    path: string[],
    allCycles: ProcedureCycle[],
    globalVisited: Set<string>
  ): void {
    // Mark as globally visited to avoid redundant searches
    globalVisited.add(currentId);
    
    // Check if we've already visited this node in current path (cycle detected)
    if (visited.has(currentId)) {
      // Find the start of the cycle in the path
      const cycleStartIndex = path.indexOf(currentId);
      if (cycleStartIndex !== -1) {
        // Extract the cycle
        const cycleProcedures = path.slice(cycleStartIndex).concat(currentId);
        
        // Build domains list
        const domains = new Set<string>();
        for (const procId of cycleProcedures) {
          const node = nodeMap.get(procId);
          if (node) {
            domains.add(node.domain);
          }
        }
        
        // Create the cycle object
        const cycle: ProcedureCycle = {
          procedures: cycleProcedures,
          domains: Array.from(domains),
          isCrossDomain: domains.size > 1
        };
        
        // Add to results if not already detected
        const cycleKey = cycleProcedures.sort().join(',');
        if (!allCycles.some(c => c.procedures.sort().join(',') === cycleKey)) {
          console.log(`Detected cycle: ${cycleProcedures.join(' -> ')} -> ${currentId}`);
          allCycles.push(cycle);
        }
      }
      return;
    }
    
    // Get the current node
    const currentNode = nodeMap.get(currentId);
    if (!currentNode) return; // Node not found, should not happen
    
    // Mark as visited in current path
    visited.add(currentId);
    path.push(currentId);
    
    // Recursively check all called procedures
    for (const calledProcId of currentNode.calls) {
      // Only follow the call if the procedure exists in our node map
      if (nodeMap.has(calledProcId)) {
        this.dfsDetectCycles(calledProcId, nodeMap, visited, path, allCycles, globalVisited);
      }
    }
    
    // Remove from current path when backtracking
    path.pop();
    visited.delete(currentId);
  }
  
}