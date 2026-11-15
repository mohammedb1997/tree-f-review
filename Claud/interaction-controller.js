/* Pointer gesture state only. Never reads or changes genealogy/presentation. */
(function(scope){
  'use strict';
  function create({thresholdPx=3}={}){
    let gesture=null;
    return {
      get active(){return !!gesture;},
      start(input){
        if(gesture)return {accepted:false};
        const {pointerId,pointerType='mouse',clientX,clientY,svgX,svgY,scale=1,mode='pan',personId,origin={x:0,y:0},before}=input;
        if(![clientX,clientY,svgX,svgY,scale,origin.x,origin.y].every(Number.isFinite)||scale<=0)return {accepted:false};
        if(!['pan','node','branch'].includes(mode))return {accepted:false};
        gesture={pointerId,pointerType,clientX,clientY,svgX,svgY,scale,mode,personId,origin:{...origin},before,moved:false,last:null};
        return {accepted:true};
      },
      move(input){
        if(!gesture||gesture.pointerId!==input.pointerId)return null;
        const {clientX,clientY,svgX,svgY}=input;
        if(![clientX,clientY,svgX,svgY].every(Number.isFinite))return null;
        if(!gesture.moved&&Math.hypot(clientX-gesture.clientX,clientY-gesture.clientY)<thresholdPx)return null;
        gesture.moved=true;
        const divisor=gesture.mode==='pan'?1:gesture.scale,dx=(svgX-gesture.svgX)/divisor,dy=(svgY-gesture.svgY)/divisor;
        gesture.last={kind:'preview',mode:gesture.mode,personId:gesture.personId,x:gesture.origin.x+dx,y:gesture.origin.y+dy,dx,dy};
        return {...gesture.last};
      },
      end({pointerId,cancelled=false}){
        if(!gesture||gesture.pointerId!==pointerId)return null;
        const previous=gesture;gesture=null;
        return {...previous.last,kind:cancelled?'cancel':previous.moved?'commit':'tap',mode:previous.mode,personId:previous.personId,before:previous.before};
      }
    };
  }
  const api={create};if(typeof module!=='undefined')module.exports=api;else scope.TreeInteraction=api;
})(globalThis);
