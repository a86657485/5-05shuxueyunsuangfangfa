/* 兼容入口：地图与角色定义已迁至 rpg.mjs（俯视校园 RPG）。 */
export {
  places, CHARACTERS, sprite, pickCharacter, guideSvg,
  mapBackground, paintLoginPreview, mountRpg,
} from './rpg.mjs';

/** 旧版百分比路径（教师页/兼容）；RPG 主界面不再使用。 */
export function mapPath() { return ''; }
export function placeIcon() { return ''; }
