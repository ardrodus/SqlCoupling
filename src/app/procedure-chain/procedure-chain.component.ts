import { Component, Input } from '@angular/core';
import { ParsedDirectoryResult } from '../sql-parser.service';

// Domain statistics interface
interface DomainStatistic {
  domain: string;
  procedureCount: number;
  totalLines: number;
  avgLines: number;
  percentage: number;
}

@Component({
  selector: 'app-procedure-chain',
  templateUrl: './procedure-chain.component.html',
  styleUrls: ['./procedure-chain.component.css']
})
export class ProcedureChainComponent {
  @Input() parsedResult: ParsedDirectoryResult | null = null;
  
  getDomainStatistics(): DomainStatistic[] {
    if (!this.parsedResult) return [];
    
    const domainMap = new Map<string, DomainStatistic>();
    
    // Group procedures by domain and calculate statistics
    for (const proc of this.parsedResult.procedures.values()) {
      if (!domainMap.has(proc.domain)) {
        domainMap.set(proc.domain, {
          domain: proc.domain,
          procedureCount: 0,
          totalLines: 0,
          avgLines: 0,
          percentage: 0
        });
      }
      
      const domainStat = domainMap.get(proc.domain)!;
      domainStat.procedureCount++;
      domainStat.totalLines += proc.lineCount;
    }
    
    // Calculate averages and percentages
    const totalLineCount = this.getTotalLinesOfCode();
    for (const stat of domainMap.values()) {
      stat.avgLines = stat.procedureCount > 0 ? stat.totalLines / stat.procedureCount : 0;
      stat.percentage = totalLineCount > 0 ? stat.totalLines / totalLineCount : 0;
    }
    
    // Sort by total lines (descending)
    return Array.from(domainMap.values())
      .sort((a, b) => b.totalLines - a.totalLines);
  }
  
  getTotalProcedures(): number {
    return this.parsedResult?.procedures?.size || 0;
  }
  
  getTotalLinesOfCode(): number {
    return this.parsedResult?.totalLineCount || 0;
  }
  
  getTotalAvgLines(): number {
    const totalProcs = this.getTotalProcedures();
    const totalLines = this.getTotalLinesOfCode();
    return totalProcs > 0 ? totalLines / totalProcs : 0;
  }
  
  getDomainColor(domain: string): string {
    // Map domain to a color using a simple hash function
    const colors = [
      '#3498db', '#e74c3c', '#2ecc71', '#f39c12', '#9b59b6', 
      '#1abc9c', '#34495e', '#d35400', '#c0392b', '#16a085'
    ];
    
    // Simple hash function
    let hash = 0;
    for (let i = 0; i < domain.length; i++) {
      hash = domain.charCodeAt(i) + ((hash << 5) - hash);
    }
    
    // Convert to color index
    const index = Math.abs(hash) % colors.length;
    return colors[index];
  }
}