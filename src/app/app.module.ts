// src/app/app.module.ts
import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';

import { AppComponent } from './app.component';
import { GraphVisualizerComponent } from './graph-visualizer/graph-visualizer.component';
import { ProcedureChainComponent } from './procedure-chain/procedure-chain.component';
// SqlParserService is providedIn: 'root'

@NgModule({
  declarations: [
    AppComponent,
    GraphVisualizerComponent,
    ProcedureChainComponent
  ],
  imports: [
    BrowserModule,
    FormsModule
  ],
  providers: [], // SqlParserService provided in root
  bootstrap: [AppComponent]
})
export class AppModule { }