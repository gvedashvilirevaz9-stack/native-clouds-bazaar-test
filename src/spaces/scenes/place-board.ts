import {garage} from '../garage/store';
import {getBuild} from './scene-store';
export function addBoardScene(id:string,at?:{x:number;y:number},by:'human'|'agent'='human'){
  const build=getBuild(id);
  const item=garage.add({kind:'scene',buildId:build.id,title:build.document.title,rot:0,w:540,h:475,by,...at});
  return {itemId:item.id,page:item.page,buildId:id};
}
