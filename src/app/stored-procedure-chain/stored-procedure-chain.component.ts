import { Component, ChangeDetectorRef } from '@angular/core';
import { ProcedureChainService, ProcedureNode, ProcedureChain, ProcedureEdge } from '../procedure-chain/procedure-chain.service';
import { Node, Edge } from '../shared-types';
import { path } from '../path-polyfill';

@Component({
  selector: 'app-stored-procedure-chain',
  templateUrl: './stored-procedure-chain.component.html',
  styleUrls: ['./stored-procedure-chain.component.css']
})
export class StoredProcedureChainComponent {
  isLoading = false;
  errorMessage: string | null = null;
  infoMessage: string | null = null;
  selectedFilePath: string | null = null;
  selectedDirPath: string  = ''; // Store the selected directory path
  procedureChain: ProcedureChain | null = null;
  graphNodes: Node[] = [];
  graphEdges: Edge[] = [];
  
  // For file selection UI
  availableSqlFiles: { path: string, name: string }[] = [];
  filteredSqlFiles: { path: string, name: string }[] = [];
  showFileSelector = false;
  selectedFileIndex: number = -1;
  searchQuery: string = ''; // For searching stored procedures

  constructor(
    private procedureChainService: ProcedureChainService,
    private cdr: ChangeDetectorRef
  ) {}

  async selectAndAnalyzeProcedure(): Promise<void> {
    // Reset UI state
    this.isLoading = true;
    this.errorMessage = null;
    this.infoMessage = "Requesting SQL file selection...";
    this.procedureChain = null;
    this.graphNodes = [];
    this.graphEdges = [];
    this.selectedFilePath = null;
    
    // Reset selected directory and ensure it's also reset in the service
    this.selectedDirPath = '';
    this.procedureChainService.setSelectedDirectoryPath('');
    
    this.availableSqlFiles = [];
    this.showFileSelector = false;
    this.selectedFileIndex = -1;
    this.cdr.detectChanges();

    try {
      // Check if Electron API is available with directory dialog
      if (window.electronAPI && typeof window.electronAPI.openDirectoryDialog === 'function') {
        // Use the available openDirectoryDialog since openFileDialog might not be implemented
        this.infoMessage = "Please select the directory containing your SQL procedure file...";
        const dirPath = await window.electronAPI.openDirectoryDialog();
        
        if (dirPath) {
          // Store the selected directory path - this is the EXACT path we should use consistently
          // The log shows this should be something like: C:\Sandboxes\EnterpriseGit\Source\Enterprise\Databases\Company\Procs\OrderDesk
          this.selectedDirPath = dirPath;
          console.log(`Selected directory: ${this.selectedDirPath}`);
          
          // IMPORTANT: Set the selected directory path in the ProcedureChainService
          this.procedureChainService.setSelectedDirectoryPath(dirPath);
          console.log(`Set directory path in ProcedureChainService: ${dirPath}`);
          this.infoMessage = "Directory selected. Loading SQL files...";
          
          // Get a list of files in the directory and filter for SQL files
          if (window.electronAPI.readDirectory) {
            const { filesData, errors } = await window.electronAPI.readDirectory(dirPath);
            
            if (errors && errors.length > 0) {
              console.warn("Errors reading directory:", errors);
            }
            
            // Filter SQL files that match the stored procedure naming pattern
            const sqlFiles = filesData.filter(file => 
              file.path.toLowerCase().endsWith('.sql') && 
              path.basename(file.path).match(/^[A-Z]{2}_[A-Za-z0-9_]+?_SP\.sql$/i)
            );
            
            if (sqlFiles.length === 0) {
              this.errorMessage = "No stored procedure SQL files found in the selected directory.";
              this.infoMessage = "Please select a directory containing SQL stored procedure files (XX_Name_SP.sql).";
              this.isLoading = false;
            } else {
              // Populate the available SQL files list
              this.availableSqlFiles = sqlFiles.map(file => {
                // Ensure we have the correct path format for Windows
                const filePath = file.path;
                console.log(`Adding SQL file to list: ${filePath}`);
                return {
                  path: filePath,
                  name: path.basename(filePath)
                };
              });
              
              // Sort files alphabetically by name
              this.availableSqlFiles.sort((a, b) => a.name.localeCompare(b.name));
              
              // Initialize filtered files with all files
              this.filteredSqlFiles = [...this.availableSqlFiles];
              this.searchQuery = ''; // Reset search query
              
              this.infoMessage = `Found ${this.availableSqlFiles.length} SQL procedure files. Please select one to analyze:`;
              this.showFileSelector = true;
              this.isLoading = false;
            }
          } else {
            this.errorMessage = "Cannot read directory contents. API method not available.";
            this.isLoading = false;
          }
        } else {
          this.infoMessage = "Directory selection cancelled.";
          this.isLoading = false;
        }
      } else {
        // No Electron API available at all
        this.errorMessage = "Electron API is not available. Please ensure the application is running in the Electron environment.";
        this.isLoading = false;
      }
    } catch (error: any) {
      console.error("Error during procedure chain analysis:", error);
      this.errorMessage = `Error: ${error.message || 'An unknown error occurred during analysis.'}`;
      this.infoMessage = null;
      this.isLoading = false;
    }
    this.cdr.detectChanges();
  }
  
  // Method to analyze the selected SQL file
  async selectFile(index: number): Promise<void> {
    if (index >= 0 && index < this.availableSqlFiles.length) {
      this.selectedFileIndex = index;
      this.isLoading = true;
      this.showFileSelector = false;
      const selectedFile = this.availableSqlFiles[index];
      this.infoMessage = `Analyzing: ${selectedFile.name}...`;
      this.cdr.detectChanges();
      
      await this.processSelectedFile(selectedFile.path);
    }
  }

  private async processSelectedFile(filePath: string): Promise<void> {
    console.log(`Processing selected file: ${filePath}`);
    try {
      // CRITICAL: Always ensure we're working with ABSOLUTE paths
      // The application doesn't run in the same directory as the codebase
      
      // Determine if we have an absolute path by checking for drive letter or leading slash
      const hasDriveLetter = /^[A-Za-z]:/.test(filePath);
      const hasLeadingSlash = filePath.startsWith('/') || filePath.startsWith('\\');
      const isAbsolutePath = hasDriveLetter || hasLeadingSlash;
      
      // Store the absolute path we'll use
      let absolutePath: string | null;
      
      // Make sure we're using the selected directory path that was set earlier
      // This is critical for ensuring consistency
      if (this.selectedDirPath) {
        // Check if filePath is already an absolute path
        if (filePath.startsWith(this.selectedDirPath)) {
          absolutePath = filePath;
          console.log(`Using absolute path directly: ${absolutePath}`);
        } else {
          // Join the selected directory path with the file path
          absolutePath = path.join(this.selectedDirPath, filePath);
          console.log(`Joined paths to create absolute path: ${absolutePath}`);
        }
      } else {
        // Fallback if no directory path is set
        console.warn(`No selected directory path set! Using file path directly: ${filePath}`);
        absolutePath = filePath;
        
        // Set the directory path from the file path as a fallback
        const dirPath = path.dirname(filePath);
        this.selectedDirPath = dirPath;
        this.procedureChainService.setSelectedDirectoryPath(dirPath);
        console.log(`Set directory path from file path: ${dirPath}`);
      }
      
      // Add .sql extension if needed
      if (!absolutePath.toLowerCase().endsWith('.sql')) {
        absolutePath += '.sql';
        console.log(`Added SQL extension: ${absolutePath}`);
      }
      
      // Double-check that we have what appears to be a true absolute path
      if (!(/^[A-Za-z]:/.test(absolutePath) || absolutePath.startsWith('/') || absolutePath.startsWith('\\'))) {
        console.error(`Path doesn't appear to be absolute: ${absolutePath}`);
        this.errorMessage = "Generated path doesn't appear to be absolute. Please report this bug.";
        this.isLoading = false;
        return;
      }
      
      // Store the absolute path for reference
      this.selectedFilePath = absolutePath;
      this.infoMessage = `Selected procedure: ${path.basename(absolutePath)}. Analyzing...`;
      this.cdr.detectChanges();
      
      // Log the ABSOLUTE path being used - this is crucial for debugging
      console.log(`Analyzing procedure at ABSOLUTE path: ${absolutePath}`);
      console.log(`Using selected directory path: ${this.selectedDirPath}`);
      
      // Make sure the procedure chain service has the selected directory path
      // This is critical for finding SQL files correctly
      this.procedureChainService.setSelectedDirectoryPath(this.selectedDirPath);
      
      // Analyze the procedure chain with the absolute path
      // The directory path from the log shows we should be using:
      // C:\Sandboxes\EnterpriseGit\Source\Enterprise\Databases\Company\Procs\OrderDesk
      this.procedureChain = await this.procedureChainService.analyzeProcedureChain(absolutePath);
      
      if (this.procedureChain) {
        this.infoMessage = `Analysis complete for: ${path.basename(absolutePath)}.`;
        this.prepareGraphData(this.procedureChain);
      } else {
        this.errorMessage = "Failed to analyze the procedure chain.";
        this.infoMessage = null;
      }
    } catch (error: any) {
      console.error("Error processing file:", error);
      this.errorMessage = `Error: ${error.message || 'An unknown error occurred while processing the file.'}`;
      this.infoMessage = null;
    } finally {
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  private prepareGraphData(chain: ProcedureChain): void {
    // Convert procedure nodes to graph nodes
    this.graphNodes = chain.nodes.map(proc => ({
      id: proc.id,
      label: proc.name,
      title: `${proc.name}\nPath: ${proc.filePath}\nCalls: ${proc.calls.length}`,
      level: proc.level,
      domain: proc.domain,
      isRoot: proc.isRoot || false,
      isMissing: proc.isMissing || false
    }));

    // Convert procedure edges to graph edges
    this.graphEdges = chain.edges.map((edge, index) => ({
      id: edge.id,
      from: edge.from,
      to: edge.to,
      isCrossDomain: edge.isCrossDomain,
      title: edge.isCrossDomain ? 'Cross-Domain Call' : 'Same-Domain Call'
    }));
  }

  get totalProcedures(): number {
    return this.procedureChain?.nodes.length || 0;
  }

  get totalCalls(): number {
    return this.procedureChain?.edges.length || 0;
  }

  get missingProcedures(): number {
    return this.procedureChain?.nodes.filter(n => n.isMissing).length || 0;
  }

  get crossDomainCalls(): number {
    return this.procedureChain?.edges.filter(e => e.isCrossDomain).length || 0;
  }
  
  // Helper method to safely replace newlines with <br> tags
  formatInfoMessage(message: string | null): string {
    if (!message) return '';
    return message.replace(/\n/g, '<br>');
  }
  
  // Filter the stored procedures based on search query
  filterStoredProcedures(query: string): void {
    this.searchQuery = query;
    
    if (!query || query.trim() === '') {
      // If no search query, show all files
      this.filteredSqlFiles = [...this.availableSqlFiles];
    } else {
      // Filter files based on query (case-insensitive)
      const lowerQuery = query.toLowerCase();
      this.filteredSqlFiles = this.availableSqlFiles.filter(file => 
        file.name.toLowerCase().includes(lowerQuery)
      );
    }
  }
}