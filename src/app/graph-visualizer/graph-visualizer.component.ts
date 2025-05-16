// src/app/graph-visualizer/graph-visualizer.component.ts
import { Component, ElementRef, Input, OnChanges, SimpleChanges, ViewChild, AfterViewInit, OnDestroy } from '@angular/core';
import { Network, DataSet, Options } from 'vis-network/standalone/esm/vis-network';

// Import shared types from a new file
import { Node, Edge } from '../shared-types';

@Component({
  selector: 'app-graph-visualizer',
  template: `
    <div #networkContainer style="width: 100%; height: 70vh; border: 1px solid lightgray; background-color: #fdfdfd;"></div>
  `,
  styles: []
})
export class GraphVisualizerComponent implements OnChanges, AfterViewInit, OnDestroy {
  @ViewChild('networkContainer', { static: false }) networkContainer!: ElementRef;

  @Input() nodesData: Node[] = [];
  @Input() edgesData: Edge[] = [];
  @Input() graphTitle: string = 'Directory Dependencies'; // Default title

  private networkInstance: Network | null = null;

  constructor() { }

  ngAfterViewInit(): void {
    if (this.nodesData.length > 0 || this.edgesData.length > 0) {
        this.renderGraph();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (this.networkContainer && (changes['nodesData'] || changes['edgesData'])) {
        this.renderGraph();
    }
  }

  private renderGraph(): void {
    if (!this.networkContainer || !this.networkContainer.nativeElement) {
        console.warn("Network container not ready.");
        return;
    }
    if (this.nodesData.length === 0 && this.edgesData.length === 0) {
        if (this.networkInstance) {
            this.networkInstance.destroy();
            this.networkInstance = null;
        }
        this.networkContainer.nativeElement.innerHTML = '<p style="text-align:center; padding-top: 50px;">No data to display in graph.</p>';
        return;
    }


    const nodes = new DataSet<Node>(this.nodesData.map(n => {
        // Base node configuration
        const nodeConfig: Node = {
            ...n,
            shape: n.isVirtual ? 'box' : 'image', // Use box for virtual nodes, image for real directories
            font: { 
                color: '#333333', 
                size: 12, 
                face: 'Arial', 
                background: 'rgba(255,255,255,0.7)', 
                strokeWidth: 0 
            },
            margin: { top: 10, right: 10, bottom: 10, left: 10 },
            title: n.isVirtual 
                ? `Virtual Directory: ${n.label}\n(Referenced but not directly scanned)` 
                : `Directory: ${n.label}`
        };
        
        // Customize based on node type
        if (n.isVirtual) {
            // Virtual nodes (referenced but not scanned directories)
            nodeConfig.shape = 'icon';
            nodeConfig.icon = {
                face: 'FontAwesome',
                code: '\uf07c', // Font Awesome folder-open icon
                size: 40,
                color: '#FF7F50' // Coral color
            };
            nodeConfig.color = {
                border: '#FF7F50', // Coral
                background: '#FFFACD' // LightYellow
            };
            nodeConfig.borderWidth = 2;
            nodeConfig.borderDashes = [5, 5]; // Dashed border for virtual nodes
            
            // Ensure font is defined before setting color
            if (nodeConfig.font) {
                nodeConfig.font.color = '#A52A2A'; // Brown font
                nodeConfig.font.background = '#FFFACD'; // LightYellow background
            } else {
                nodeConfig.font = { 
                    color: '#A52A2A',
                    background: '#FFFACD'
                };
            }
            
            // Extract domain prefix from directory path
            const pathString = n.label as string;
            
            // Check if it's a domain virtual node (XX_Domain pattern)
            if (pathString.match(/^[A-Z]{2}_Domain$/)) {
                const domainPrefix = pathString.substring(0, 2);
                nodeConfig.label = `${domainPrefix} Domain (Virtual)`;
                nodeConfig.title = `Virtual Directory: ${domainPrefix} Domain\n(Referenced but not directly scanned)`;
            } 
            // Otherwise try to extract domain from path parts
            else {
                const pathParts = pathString.split('/');
                const lastPart = pathParts[pathParts.length - 1];
                if (lastPart && lastPart.length >= 2) {
                    const domainPrefix = lastPart.substring(0, 2).toUpperCase();
                    nodeConfig.label = `${n.label} (${domainPrefix})`;
                }
            }
        } else {
            // Real directory nodes - use a shape with a directory-like icon
            nodeConfig.shape = 'icon';
            nodeConfig.icon = {
                face: 'FontAwesome',
                code: '\uf07b', // Font Awesome folder icon
                size: 40,
                color: '#3498db'
            };
            nodeConfig.color = {
                border: '#B0C4DE', // LightSteelBlue
                background: 'transparent'
            };
        }
        
        return nodeConfig;
    }));

    const edges = new DataSet<Edge>(this.edgesData.map(e => {
        // Default colors for same-domain dependencies
        let edgeColor = '#90EE90'; // LightGreen
        let highlightColor = '#32CD32'; // LimeGreen
        let hoverColor = '#3CB371'; // MediumSeaGreen
        
        // Use different colors for cross-domain dependencies
        if (e.isCrossDomain) {
            edgeColor = '#FF7F50'; // Coral
            highlightColor = '#FF4500'; // OrangeRed
            hoverColor = '#FF6347'; // Tomato
        }
        
        return {
            ...e,
            arrows: { to: { enabled: true, scaleFactor: 0.7, type: 'arrow' } },
            color: { color: edgeColor, highlight: highlightColor, hover: hoverColor },
            smooth: {
                enabled: true,
                type: 'cubicBezier',
                forceDirection: 'horizontal', // or 'vertical' or 'none'
                roundness: 0.4
            },
            length: 250, // Preferred edge length
            // Add a title (tooltip) that shows if it's cross-domain
            title: e.isCrossDomain ? 'Cross-Domain Dependency' : 'Same-Domain Dependency'
        };
    }));

    const data = { nodes, edges };

    const options: Options = {
      layout: {
        hierarchical: {
          enabled: true,
          direction: 'LR', // Left to Right
          sortMethod: 'directed',
          nodeSpacing: 180,
          levelSeparation: 220,
          treeSpacing: 220,
          blockShifting: true,
          edgeMinimization: true,
          parentCentralization: true,
        }
      },
      physics: {
        enabled: false, // Usually false with hierarchical layout
        hierarchicalRepulsion: {
            nodeDistance: 180,
        }
      },
      interaction: {
        dragNodes: true,
        dragView: true,
        hover: true,
        zoomView: true,
        tooltipDelay: 200,
        navigationButtons: true, // Adds zoom/fit buttons
        keyboard: true
      },
      nodes: {
        shape: 'box', // Default shape
        shapeProperties: {
            useBorderWithImage: true // Show border if shape is image
        },
        borderWidth: 1,
        shadow: false,
        font: {
            multi: false, // Ensure label is single line
            size: 12,
            face: 'Arial',
            color: '#333333',
            background: 'rgba(255,255,255,0.7)'
        },
        margin: { top: 10, right: 10, bottom: 10, left: 10 }
      },
      edges: {
        width: 1.5,
        hoverWidth: 0.5, // How much wider on hover
        selectionWidth: 0.5, // How much wider when selected
        color: {
          inherit: false
        },
        smooth: {
            enabled: true,
            type: 'cubicBezier',
            roundness: 0.5
        }
      },
    };

    if (this.networkInstance) {
        this.networkInstance.destroy();
    }
    this.networkInstance = new Network(this.networkContainer.nativeElement, data, options);

    // Add title using DOM manipulation (Vis.js doesn't have a built-in graph title feature)
    // This is a simple way; for complex UIs, integrate into Angular template
    const titleEl = this.networkContainer.nativeElement.querySelector('.graph-title-overlay');
    if (titleEl) titleEl.remove();

    const newTitleEl = document.createElement('div');
    newTitleEl.className = 'graph-title-overlay';
    newTitleEl.style.position = 'absolute';
    newTitleEl.style.top = '10px';
    newTitleEl.style.left = '10px';
    newTitleEl.style.fontSize = '16px';
    newTitleEl.style.fontWeight = 'bold';
    newTitleEl.style.color = '#555';
    newTitleEl.style.backgroundColor = 'rgba(255, 255, 255, 0.8)';
    newTitleEl.style.padding = '5px 10px';
    newTitleEl.style.borderRadius = '3px';
    newTitleEl.style.zIndex = '10';
    // You can create a dynamic title string
    const numNodes = this.nodesData.length;
    const numEdges = this.edgesData.length;
    newTitleEl.textContent = `${this.graphTitle || '[Critical] C# Directory cycle group'} (${numNodes} nodes, ${numEdges} edges)`; // Use input or default
    this.networkContainer.nativeElement.prepend(newTitleEl);
  }

  ngOnDestroy(): void {
    if (this.networkInstance) {
      this.networkInstance.destroy();
      this.networkInstance = null;
    }
  }
}