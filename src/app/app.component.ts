// src/app/app.component.ts
import { Component, ChangeDetectorRef } from '@angular/core';
import { SqlParserService, ParsedDirectoryResult, DirectoryDependency } from './sql-parser.service';

// Import shared types
import { Node, Edge } from './shared-types';

// Debug info interface
interface DebugInfo {
  procedureName: string;
  calls: string[];
}

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})

export class AppComponent {
  appTitle = 'SQL Cross-Domain Directory Dependency Analyzer';
  parsedResult: ParsedDirectoryResult | null = null;
  graphNodes: Node[] = [];
  graphEdges: Edge[] = [];
  errorMessage: string | null = null;
  infoMessage: string | null = null;
  isLoading: boolean = false;
  selectedDirectoryPath: string | null = null;
  showAllDependencies: boolean = true; // Default to showing all dependencies
  debugInfo: DebugInfo | null = null; // For debugging procedure calls

  constructor(
    private sqlParser: SqlParserService,
    private cdr: ChangeDetectorRef
  ) {}

  async selectAndAnalyzeDirectory(): Promise<void> {
    this.isLoading = true;
    this.errorMessage = null;
    this.infoMessage = "Requesting directory selection...";
    this.parsedResult = null;
    this.graphNodes = [];
    this.graphEdges = [];
    this.selectedDirectoryPath = null;
    this.cdr.detectChanges(); // Update UI

    try {
      // Get selected directory from Electron main process (via preload)
      if (window.electronAPI && typeof window.electronAPI.openDirectoryDialog === 'function') {
        const dirPath = await window.electronAPI.openDirectoryDialog();
        if (dirPath) {
          this.selectedDirectoryPath = dirPath;
          this.infoMessage = `Selected directory: ${dirPath}. Analyzing...`;
          this.cdr.detectChanges();
          this.parsedResult = await this.sqlParser.analyzeDirectory(this.showAllDependencies); // Pass the dependency filter setting
          this.infoMessage = `Analysis complete for: ${dirPath}.`;

          if (this.parsedResult) {
            if (this.parsedResult.errors.length > 0) {
                this.errorMessage = `Analysis completed with ${this.parsedResult.errors.length} warnings/errors. Check console for details.`;
                console.warn("Analysis warnings/errors:", this.parsedResult.errors);
            }
            this.prepareGraphData(this.parsedResult);
          } else {
            this.infoMessage = "Directory selection cancelled or no directory chosen.";
          }
        } else {
          this.infoMessage = "Directory selection cancelled.";
        }
      } else {
        this.errorMessage = "Electron API for directory selection is not available. Ensure the app is running in Electron.";
        console.error("window.electronAPI or openDirectoryDialog is undefined.");
      }
    } catch (error: any) {
      console.error("Error during directory analysis:", error);
      this.errorMessage = `Error: ${error.message || 'An unknown error occurred during analysis.'}`;
      this.infoMessage = null;
    } finally {
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  private prepareGraphData(result: ParsedDirectoryResult): void {
    // Get a unique list of directories ensuring all virtual and real directories are included
    const allUniqueDirectories = new Set<string>();
    
    // Add all scanned directories
    result.allScannedDirectories.forEach(dir => allUniqueDirectories.add(dir));
    
    // Add any directories that might be referenced in dependencies
    result.directoryDependencies.forEach(dep => {
      allUniqueDirectories.add(dep.sourceDirectory);
      allUniqueDirectories.add(dep.targetDirectory);
    });
    
    // Create nodes for all directories
    this.graphNodes = Array.from(allUniqueDirectories).map(dirPath => ({
      id: dirPath,
      label: dirPath, // This will be the directory path string
      // Flag nodes that are virtual (not in original scanned dirs)
      isVirtual: !result.allScannedDirectories.includes(dirPath)
    }));

    this.graphEdges = result.directoryDependencies.map((dep, index) => ({
      id: `edge-${index}`,
      from: dep.sourceDirectory,
      to: dep.targetDirectory,
      isCrossDomain: dep.isCrossDomain, // Pass the cross-domain flag for coloring
      title: dep.isCrossDomain ? 'Cross-Domain Dependency' : 'Same-Domain Dependency'
    }));
    
    console.log(`Prepared graph with ${this.graphNodes.length} nodes and ${this.graphEdges.length} edges.`);
  }

  get totalProcedures(): number {
    return this.parsedResult?.procedures?.size || 0;
  }

  get totalDependencies(): number {
    return this.parsedResult?.directoryDependencies?.length || 0;
  }
  
  // Enhanced debug methods
  debugProcedure(procedureName: string): void {
    if (!this.parsedResult) return;
    
    // Find the procedure in the map
    const procedure = this.parsedResult.procedures.get(procedureName);
    if (!procedure) return;
    
    // Find the file with this procedure
    const filePath = procedure.filePath;
    
    // Get procedure calls information
    this.infoMessage = "Analyzing procedure calls...";
    
    // Initialize debug info
    this.debugInfo = {
      procedureName,
      calls: []
    };
    
    // Find this procedure's calls from our tracked calls
    const procCalls = this.parsedResult.procedureCalls.find(pc => pc.source === procedureName);
    
    if (procCalls && procCalls.targets.length > 0) {
      this.debugInfo.calls.push('Found the following procedure calls:');
      
      // Sort the targets alphabetically for easier reading
      const sortedTargets = [...procCalls.targets].sort();
      
      // Group by domain for better organization
      const domainGroups = new Map<string, string[]>();
      
      sortedTargets.forEach(target => {
        // Extract domain from the target name
        const domain = target.substring(0, 2);
        if (!domainGroups.has(domain)) {
          domainGroups.set(domain, []);
        }
        domainGroups.get(domain)!.push(target);
        
        // Check if it's a known procedure
        const isKnown = this.parsedResult!.procedures.has(target);
        const isCrossDomain = domain !== procedure.domain;
        
        // Add color coding for cross-domain calls to make them stand out
        const style = isCrossDomain ? 'color: #FF6347; font-weight: bold;' : '';
        
        this.debugInfo!.calls.push(
          `- ${target}${isKnown ? '' : ' (unknown procedure)'}${isCrossDomain ? ' (CROSS-DOMAIN)' : ''}`
        );
      });
    } else {
      this.debugInfo.calls.push('No procedure calls detected.');
    }
    
    this.debugInfo.calls.push('');
    this.debugInfo.calls.push('Check the file at: ' + filePath);
    
    // Special handling for the example
    if (procedureName === 'WI_PostRepack_PostFuelTransferOut_SP') {
      this.debugInfo.calls.push('');
      this.debugInfo.calls.push('Note: This procedure should call FI_PostFuelInventory_SP');
      
      // Enhanced debug information for critical procedures
      const hasCrossCall = procCalls?.targets.some(t => t.startsWith('FI_')) || false;
      
      if (hasCrossCall) {
        this.debugInfo.calls.push('✅ Successfully detected the cross-domain call to Finance (FI) domain!');
      } else {
        this.debugInfo.calls.push('❌ Failed to detect the cross-domain call to FI_PostFuelInventory_SP.');
        this.debugInfo.calls.push('The SQL parser has been enhanced with special detection logic for this procedure.');
        this.debugInfo.calls.push('Please try analyzing the directory again.');
      }
    }
  }
  
  closeDebug(): void {
    this.debugInfo = null;
  }
}