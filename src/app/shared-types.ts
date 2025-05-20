// src/app/shared-types.ts
import { Node as VisNode, Edge as VisEdge } from 'vis-network/standalone/esm/vis-network';

// Extended Node interface with all required properties
export interface Node extends VisNode {
  // Common properties
  isVirtual?: boolean; // Flag for virtual nodes (not directly scanned directories)
  
  // Visual styling properties
  borderWidth?: number;
  borderDashes?: number[];
  margin?: {
    top?: number;
    right?: number;
    bottom?: number;
    left?: number;
  };
  icon?: {
    face?: string;
    code?: string;
    size?: number;
    color?: string;
  };
  font?: {
    color?: string;
    size?: number;
    face?: string;
    background?: string;
    strokeWidth?: number;
    multi?: boolean | string;
  };
}

// Extended Edge interface
export interface Edge extends VisEdge {
  isCrossDomain?: boolean; // Flag for edges that cross domain boundaries
}

// Metrics interfaces for SQL dependency analysis
export interface DomainMetrics {
  name: string;            // Domain name (e.g., "FI", "OD")
  procedureCount: number;  // Number of procedures in this domain
  inboundCalls: number;    // Calls from other domains to this domain
  outboundCalls: number;   // Calls from this domain to other domains
  internalCalls: number;   // Calls within the same domain
  couplingScore: number;   // Measure of domain coupling (0-100%)
}

export interface ProcedureMetrics {
  name: string;            // Procedure name
  callDepth: number;       // Maximum call depth (levels) from this procedure
  callerCount: number;     // Number of procedures that call this procedure
  calleeCount: number;     // Number of procedures called by this procedure
  complexityScore: number; // Complexity score based on calls and structure
  isCritical: boolean;     // Whether this is a critical procedure (high usage)
}

export interface ChainMetrics {
  maxCallDepth: number;          // Maximum depth of the call chain
  avgCallDepth: number;          // Average procedure call depth
  entryPoints: number;           // Procedures with no callers (entry points)
  leafNodes: number;             // Procedures that don't call others
  domainCouplingScore: number;   // Overall domain coupling score (0-100%)
  crossDomainRatio: number;      // Ratio of cross-domain calls to total calls
  hotspotProcedures: string[];   // Top 5 most referenced procedures
  cyclomaticComplexity: number;  // Graph complexity score
  domains: DomainMetrics[];      // Metrics for each domain
}