import {CurvePath,LineCurve3,MathUtils,QuadraticBezierCurve3,Vector3} from 'three';
import {boardOffset,clearanceHeight,clearPath} from './camera-space.js';

const up=new Vector3(0,1,0);
const smooth=MathUtils.smootherstep;

function roundedPath(points){
  const path=new CurvePath();
  points=points.filter((p,i)=>!i||p.distanceToSquared(points[i-1])>.000001);
  let last=points[0];
  for(let i=1;i<points.length-1;i++){
    const corner=points[i],before=points[i-1],after=points[i+1];
    const incoming=before.distanceTo(corner),outgoing=after.distanceTo(corner);
    const radius=Math.min(.75,.25*incoming,.25*outgoing);
    const enter=corner.clone().lerp(before,radius/incoming);
    const leave=corner.clone().lerp(after,radius/outgoing);
    path.add(new LineCurve3(last,enter));path.add(new QuadraticBezierCurve3(enter,corner,leave));
    last=leave;
  }
  path.add(new LineCurve3(last,points.at(-1)));
  return path;
}

// The boxes have a waist-high glass rail and four posts at the front. Cross
// through the middle of an open bay with headroom under the 14.88 m lintel.
function suitePassage(suite,p){
  const edge=suite.surface[0],left=edge[0][0],right=edge.at(-1)[0];
  const bay=MathUtils.clamp(Math.floor(3*(p.x-left)/(right-left)),0,2);
  const x=MathUtils.lerp(left,right,(bay+.5)/3),z=suite.normal[1];
  return {outside:new Vector3(x,13.75,z*33.4),inside:new Vector3(x,13.75,p.z)};
}

function above(position,y){return new Vector3(position.x,y,position.z);}

function containingSuite(p,suites){
  return suites.find(s=>Math.abs(p.x-s.anchor[0])<5.72&&p.z*s.normal[1]>34.45
    &&p.z*s.normal[1]<41.25&&p.y>11.35&&p.y<14.88);
}

function crossBowl(points,destination,suites){
  const origin=points.at(-1);
  if(!clearPath(origin,destination,suites)){
    // Cross at a height that clears every intervening row, even on an oblique
    // route between two sectors. Change height above the endpoints.
    let height=Math.max(origin.y,destination.y);
    const n=Math.max(1,Math.ceil(origin.distanceTo(destination)/.22)),probe=new Vector3();
    for(let i=0;i<=n;i++){
      probe.lerpVectors(origin,destination,i/n);
      height=Math.max(height,clearanceHeight(probe,suites)+.85);
    }
    points.push(above(origin,height),above(destination,height));
  }
  points.push(destination);
}

function blendDirection(a,b,t,out){
  const yaw=Math.atan2(a.x,a.z),delta=Math.atan2(b.x,b.z)-yaw;
  const angle=yaw+Math.atan2(Math.sin(delta),Math.cos(delta))*t;
  const pitch=MathUtils.lerp(Math.asin(MathUtils.clamp(a.y,-1,1)),Math.asin(MathUtils.clamp(b.y,-1,1)),t);
  return out.set(Math.sin(angle)*Math.cos(pitch),Math.sin(pitch),Math.cos(angle)*Math.cos(pitch));
}

export function seatFlight(start,initialDirection,seat,suites){
  const eye=new Vector3(seat[3],seat[4]+1.20,seat[5]);
  const inward=new Vector3(-Math.sin(seat[6]),0,-Math.cos(seat[6]));
  const facing=new Vector3(0,.63,0).sub(eye).normalize();
  if(start.distanceTo(eye)<.04){
    return {duration:280,sample(t,p,d){p.lerpVectors(start,eye,smooth(t,0,1));blendDirection(initialDirection,facing,smooth(t,0,1),d);}};
  }
  const suite=suites.find(s=>s.id===seat[0]);
  const originSuite=containingSuite(start,suites);
  const standing=eye.clone().addScaledVector(inward,.12).addScaledVector(up,.52);
  const points=[start.clone()];
  if(originSuite){
    points.push(above(start,13.75));
    if(originSuite!==suite){
      const exit=suitePassage(originSuite,start);
      points.push(exit.inside,exit.outside);
    }
  }
  if(suite){
    if(suite!==originSuite){
      const entry=suitePassage(suite,eye);
      crossBowl(points,entry.outside,suites);points.push(entry.inside);
    }
    points.push(above(standing,13.75));
  }else{
    const approach=eye.clone().addScaledVector(inward,1.45).addScaledVector(up,1.75);
    crossBowl(points,approach,suites);
  }
  points.push(standing);
  const route=roundedPath(points);
  const travel=MathUtils.clamp(780+route.getLength()*18,850,1810),settle=440;
  const duration=travel+settle;
  const chair=eye.clone().addScaledVector(up,-.53);
  const turnAt=.46,turnStart=chair.clone().sub(route.getPoint(smooth(turnAt,0,1))).normalize();
  const tracking=new Vector3();
  return {
    duration,
    sample(t,p,d){
      const time=t*duration,progress=Math.min(time/travel,1);
      if(time<travel)p.copy(route.getPoint(MathUtils.clamp(smooth(progress,0,1),0,1)));
      else p.lerpVectors(standing,eye,smooth((time-travel)/settle,0,1));
      if(progress<turnAt){
        tracking.copy(chair).sub(p).normalize();
        blendDirection(initialDirection,tracking,smooth(progress,0,turnAt),d);
      }else blendDirection(turnStart,facing,smooth(progress,turnAt,.97),d);
    }
  };
}

export function sectionFlight(start,initialDirection,pose,suites){
  const suite=containingSuite(start,suites);
  const height=suite?13.75:clearanceHeight(start,suites)+.65;
  const raised=above(start,Math.max(start.y,height));
  const points=[raised];
  if(suite){
    const exit=suitePassage(suite,raised);
    points.push(exit.inside,exit.outside);
  }
  crossBowl(points,pose.pos,suites);
  const path=roundedPath(points);
  const facing=pose.target.clone().sub(pose.pos).normalize();
  const lift=Math.min(420,(raised.y-start.y)*420);
  const glide=MathUtils.clamp(700+path.getLength()*19,780,1750);
  const duration=lift+glide;
  return {
    duration,
    sample(t,p,d){
      if(t>=1){p.copy(pose.pos);d.copy(facing);return;}
      const time=t*duration;
      if(time<lift){p.lerpVectors(start,raised,smooth(time/lift,0,1));d.copy(initialDirection);return;}
      const progress=MathUtils.clamp((time-lift)/glide,0,1);
      p.copy(path.getPoint(MathUtils.clamp(smooth(progress,0,1),0,1)));
      blendDirection(initialDirection,facing,smooth(progress,0,.94),d);
    }
  };
}

export function beneathRoof(p){
  // The lowest overhead struts start at 13 m. The suite entrances are beyond them.
  return p.y<12.65||(p.y<14.35&&boardOffset(p)>17&&Math.abs(p.x)<7.5);
}
