export type Locale = 'zh-CN' | 'en';

const english: Record<string, string> = {
  'RAT TIDE — 机械怒潮': 'RAT TIDE — Iron Tide',
  'RAT TIDE 游戏画面': 'RAT TIDE game canvas',
  '/ 渔船状态': '/ VESSEL STATUS',
  '装甲减伤': 'Damage reduction', '装甲': 'Armor', '武器伤害': 'Weapon damage', '伤害': 'Damage', '攻击': 'Attack',
  '暴击概率': 'Critical chance', '暴击': 'Critical', '引擎动力 / 移动速度': 'Engine power / speed', '动力': 'Power',
  '渔夫等级': 'Captain level', '技能点 +10/秒': 'Skill points +10/sec', '可用技能点': 'Skill points',
  '声呐': 'SONAR', '威胁 0': 'Threats 0', '声呐雷达': 'Sonar radar', '击杀 0': 'Kills 0',
  '快捷键 F：自动锁定射程内海兽并开火': 'F: automatically target and fire at creatures in range',
  '自动攻击': 'Auto attack', '快捷键 G：受击或遭遇袭击时立即锁定攻击源反击': 'G: counterattack the source when attacked',
  '自动反击': 'Auto counter', '快捷键 M：开启可选的鼠标船体转向': 'M: enable optional pointer steering',
  '360°鼠标转向': 'Mouse steering', '快捷键 H：智能使用背包物资修复船体/止血/加油/饮食': 'H: automatically use supplies to repair, stop bleeding, refuel, and eat',
  '一键整备': 'Quick resupply', '导出进度为 .txt 文本存档': 'Export progress as a .txt save', '导出TXT': 'Export save',
  '从 .txt 文本导入进度存档': 'Import progress from a .txt save', '导入TXT': 'Import save',
  '技能菜单': 'Skills menu', '打开技能窗': 'Open skills', '深渊机械章鱼': 'Abyssal Mech Octopus',
  '目标': 'Target', '追击': 'Chasing', '生存体征': 'VITALS', '饥饿': 'Hunger', '淡水': 'Water', '柴油': 'Fuel',
  '流血': 'Bleeding', '疼痛': 'Pain', '再生': 'Regeneration', '热力核心': 'HEAT CORE', '充能 +3%/s': 'Charging +3%/s',
  '过热觉醒': 'Overheat Awakening', '每秒 +3% · 命中加速 · 100% 释放': '+3%/sec · hits charge faster · unleash at 100%',
  '半径 30m / 5.5s': '30m radius / 5.5s', '满': 'FULL', '船舱已满 · 无法自动拾取': 'Hold full · cannot collect automatically',
  '金属零件': 'Metal parts', '油门': 'Throttle', '鼠标': 'Mouse', '360°转向': '360° steering', '靠近': 'Approach',
  '自动拾取': 'Auto collect', '背包': 'Inventory', '强化 (+2点/分)': 'Skills (+10/sec)', '热力觉醒': 'Heat awakening',
  '30 米内机械海兽瞬间熔毁': 'Destroys mechanical sea creatures within 30 m', '操作说明': 'Controls', '暂停 (Esc)': 'Pause (Esc)',
  '机械怒潮': 'IRON TIDE', '风暴撕开了旧渔场。海面下，锈蚀的机械开始呼吸。': 'A storm tore through the old fishing grounds. Beneath the waves, rusted machines are waking.',
  '驾驶你的拖网渔船，360°机动巡航、自动索敌反击、掠夺升级，活到下一次涨潮。': 'Pilot your trawler, navigate the open sea, fight mechanical predators, and survive until the next tide.',
  '驾驶你的拖网渔船，灵活航行、自动索敌反击、掠夺升级；鱼群会随时间增多，活到下一次涨潮。': 'Pilot your trawler, fight mechanical predators, and upgrade. More fish arrive as time passes. Survive until the next tide.',
  'U 技能 (+10点/秒)': 'U Skills (+10/sec)',
  '鱼群与技能成长': 'Fish and skill growth',
  '鱼群会随着航行时间增加，最多同时出现 6 只。航行期间每秒自动增加 10 个技能点，升级时另获 1 点。技能可无限升级；通过左侧技能菜单或按 U 打开技能窗。': 'More fish arrive as you sail, up to 6 at a time. Gain 10 skill points per second and 1 more on level-up. Skills have no level cap; use the left skills menu or press U to open the panel.',
  '技能 (+10点/秒)': 'Skills (+10/sec)',
  '每秒 +10 技能点 · 范围秒杀': '+10 skill points/sec · area takedown',
  '开始新航程': 'Start new voyage', '继续存档': 'Continue save', '导入 TXT 存档': 'Import TXT save', '导出 TXT 存档': 'Export TXT save',
  '360° 鼠标航行': '360° mouse steering', '全向转向 · 磁吸自动拾取': 'All-direction steering · magnetic pickup',
  '智能火控系统': 'Smart fire control', '自动攻击 · 受击自动反击': 'Auto attack · automatic counterattack',
  '热力核心 +3%/秒': 'Heat core +3%/sec', '每分钟 +2 技能点 · 范围秒杀': '+10 skill points/sec · area takedown',
  'TXT 文本存档': 'TXT save files', '一键导出文本 · 随时跨端导入': 'Export in one click · import on any device',
  '强化 (含动力)': 'Skills (including power)', '强化渔船': 'Upgrade vessel',
  '每级获得 1 个强化点，航行中每秒自动增加 10 点。技能等级没有上限。': 'Gain 1 point per level and 10 more every second while sailing. Skill levels have no cap.',
  '可用强化点': 'Available skill points', '继续航行': 'Resume voyage', '船舱与补给': 'Hold & supplies', '关闭': 'Close',
  '0 / 24 格': '0 / 24 slots', '靠近海上物资自动拾取 · 点击物品或按数字键 1-7 使用': 'Loot is collected automatically · click an item or press 1–7 to use it',
  '船舱空空如也。击毁机械海兽或靠近漂浮残骸即可自动拾取补给。': 'Your hold is empty. Destroy mechanical creatures or approach floating debris to collect supplies.',
  '当前属性': 'Current stats', '最大船体': 'Max hull', '攻击频率': 'Fire rate', '动力航速': 'Vessel speed', '暴击伤害': 'Critical damage',
  '快捷补给': 'Quick supplies', '生肉': 'Raw meat', '金属维修': 'Metal repair',
  '绷带': 'Bandage', '止痛药': 'Painkiller', '再生药剂': 'Regeneration', '暂停与存档管理': 'Pause & save management',
  '快速保存 (本地)': 'Quick save (local)', '导出 TXT 文本存档': 'Export TXT save', '导入 TXT 文本存档': 'Import TXT save',
  '查看 / 粘贴 TXT 存档码': 'View / paste TXT save data', '打开船舱': 'Open hold', '放弃航程': 'Abandon voyage',
  '主音量': 'Master volume', '画质': 'Quality', '高': 'High', '中': 'Medium', '低': 'Low', '镜头灵敏度': 'Camera sensitivity',
  'TXT 文本存档导入 / 导出': 'Import / export TXT save',
  '可将下方存档内容复制保存为 .txt 文件，或直接粘贴已有 .txt 存档内容并点击「解析并载入存档」。': 'Copy the save below into a .txt file, or paste an existing save and choose “Parse and load”.',
  '在此粘贴 RAT TIDE 的 .txt 存档内容...': 'Paste RAT TIDE .txt save data here...', '下载为 .txt 文件': 'Download .txt file',
  '选择本地 .txt 文件': 'Choose local .txt file', '复制存档文本': 'Copy save text', '解析并载入存档': 'Parse and load',
  '渔船沉没': 'Vessel lost', '大海收回了它的铁皮。': 'The sea has reclaimed its rusted prize.', '等级': 'Level', '击杀': 'Kills',
  '存活': 'Survived', '最高热力': 'Peak heat', '导入 TXT 存档复活': 'Import TXT save to continue', '重新起航': 'Set sail again',
  '操作与生存指南': 'Captain’s guide', '360° 航行与转向': 'Sailing & steering', '前进油门，': 'Throttle forward, ',
  '倒车/减速。开启 360° 鼠标转向（': 'reverse / brake. Mouse steering is off by default; press ', '键切换）时，渔船会自动向鼠标指向的 360° 方位平滑转向；也可随时按': ' to enable steering toward the pointer. You can also steer with ',
  '手动打舵。右键拖动可 360° 自由环绕观察。': ' at any time. Drag with the right mouse button to orbit the camera.',
  '自动攻击与自动反击': 'Auto attack & counterattack', '切换': ' toggles ', '（自动锁定射程内海兽并预判开火）；按': ' (automatically target and lead creatures in range); press ',
  '（遭遇海兽攻击时立即缩短装填并锁定袭击者反击）。按住鼠标左键或空格可随时手动接管射击。': ' (counterattack attackers and speed up reload). Hold left mouse or Space to fire manually.',
  '热力觉醒 (+3%/秒)': 'Heat awakening (+3%/sec)', '热力核心每秒自动充能 3%，命中海兽额外加速充能。达到 100% 自动释放范围秒杀，30 米内所有海兽瞬间熔毁！': 'The heat core charges by 3% per second and faster on hits. At 100%, it destroys all creatures within 30 meters!',
  '自动拾取与物资': 'Auto pickup & supplies', '渔船靠近海上漂浮战利品或补给箱时将': 'Floating loot and supply crates are ', '入舱。按': ' into your hold when approached. Press ',
  '可一键整备（自动维修、止血、止痛、补充淡水/食物/柴油）。': ' to automatically repair, stop bleeding, treat pain, and restock food, water, and fuel.',
  'TXT 文本存档系统': 'TXT save system', '支持将当前进度一键导出为': 'Export your progress to a ', '文本文件，或随时从本地': ' file, or restore it from a local ',
  '文件及文本粘贴框导入恢复进度，跨浏览器与多端迁移永不丢失。': ' file or pasted text. Carry your save between browsers and devices.',
  '技能成长 (+10点/秒)': 'Skill growth (+10/sec)', '航行期间': 'While sailing, ', '每秒自动增加 10 个技能点': ' gain 10 skill points per second',
  '，升级时另获 1 点。技能可无限升级；通过左侧技能菜单或按': '. Earn 1 more on level-up. Skills have no level cap; use the left skills menu or press ',
  '打开技能窗。': ' to open the skills panel.', '返回': 'Back',
  '耐久': 'Hull', '频率': 'Fire rate',
  '加固船壳与关键舱室，降低所有来源的伤害。': 'Reinforce the hull and critical compartments to reduce incoming damage.',
  '焊接隔水舱，提高渔船最大船体值并立即修复新增部分。': 'Add watertight compartments to increase maximum hull and repair the added amount.',
  '更换炮管与高爆弹头，提高主炮的基础伤害。': 'Upgrade the cannon and shells to increase base weapon damage.',
  '优化装填机构，缩短主炮射击间隔。': 'Improve the loading mechanism to fire the main cannon more often.',
  '校准火控核心。暴击造成 10 倍伤害，并为热力觉醒延长持续时间。': 'Calibrate fire control. Critical hits deal 10× damage and extend Heat Awakening.',
  '改装涡轮增压柴油机与推进螺旋桨，提升渔船移动速度、加速与转向灵敏度。': 'Upgrade the turbo diesel and propeller to improve speed, acceleration, and handling.',
  '来历不明的海兽肉。恢复 28 点饥饿，有轻微感染风险。': 'Mysterious sea-creature meat. Restores 28 hunger, with a small infection risk.',
  '食用': 'Eat', '经过过滤的淡水。恢复 38 点口渴值。': 'Filtered water. Restores 38 thirst.', '饮用': 'Drink',
  '浑浊但可燃的船用柴油。为渔船补充 30 点燃油。': 'Cloudy but combustible marine diesel. Restores 30 fuel.', '加注': 'Refuel',
  '锈蚀但可用的零件。修复 38 点船体损伤。': 'Rusty but useful parts. Repair 38 hull.', '维修': 'Repair',
  '止血绷带。立即停止流血，并恢复 8 点船体。': 'Stops bleeding and restores 8 hull.', '包扎': 'Bandage',
  '强效止痛药。解除疼痛负面状态。': 'Relieves the pain status.', '服用': 'Take', '持续 6 秒，每秒恢复 7.5 点船体。': 'Restores 7.5 hull per second for 6 seconds.', '注射': 'Inject',
  '腐蚀机械鱼': 'Corroded Mech Fish', '机械鱼': 'Mech Fish', '装甲变异鲨鱼': 'Armored Mutant Shark', '装甲鲨': 'Armored Shark',
  '深海机械章鱼': 'Deep-Sea Mech Octopus', '机械章鱼': 'Mech Octopus', '巡游': 'Patrolling',
  '受损': 'Damaged', '已摧毁': 'Destroyed', '已达到最高等级': 'Maximum level reached',
  '下一级：': 'Next: ', '等级 ': 'Level ', '消耗 1 强化点': 'Cost: 1 skill point', '需要强化点': 'Need skill points',
  '半径 30m / ': '30m radius / ', '格': 'slots', '点击：': 'Click: ',
  '船体完好，无需维修': 'Hull is in good condition', '当前没有流血，船体也无需包扎': 'No bleeding or hull damage to treat',
  '当前没有疼痛状态': 'No pain status to treat', '船体正在流血！按 5 或 H 使用绷带': 'Hull is bleeding! Press 5 or H to use a bandage',
  '疼痛发作：伤害与操控下降。按 6 或 H 使用止痛药': 'Pain reduces damage and handling. Press 6 or H to use a painkiller',
  '撞上浅滩！使用金属零件维修船体': 'Grounded! Use metal parts to repair the hull', '警告：深海机械章鱼接近！': 'Warning: Deep-Sea Mech Octopus approaching!',
  '燃油耗尽！按 3 或 H 使用柴油补给': 'Out of fuel! Press 3 or H to refuel', '饥饿耗尽，船体正在持续受损': 'Starving: hull is taking damage',
  '淡水耗尽，船体正在持续受损': 'Dehydrated: hull is taking damage', '船体严重受损！按 4 或 H 使用金属零件维修': 'Critical hull damage! Press 4 or H to repair',
  '当前状态良好或船舱缺少对应补给': 'Conditions are stable or the required supply is missing', '进度已保存': 'Progress saved',
  'TXT 存档内容已复制到剪贴板': 'TXT save copied to clipboard', 'TXT 存档内容已复制': 'TXT save copied',
  '请先粘贴有效的 TXT 存档内容或选择文件': 'Paste valid TXT save data or choose a file first',
  '再次点击确认放弃航程': 'Click again to abandon this voyage', '最近存档：': 'Latest save: ',
  '保存失败：浏览器存储不可用，请使用导出 TXT 存档': 'Save failed: browser storage unavailable. Export a TXT save instead.',
  '读取 TXT 存档文件失败': 'Could not read TXT save file', '无效的 TXT 存档格式，请检查文件内容': 'Invalid TXT save format. Check the file contents.',
  '没有可用存档': 'No save available', '存档已载入': 'Save loaded', '存档已载入 · LV ': 'Save loaded · LV ',
  'TXT 存档导入成功': 'TXT save imported', 'TXT 文本存档已导出 (LV ': 'TXT save exported (LV ',
  '自动攻击已': 'Auto attack ', '自动反击已': 'Auto counter ', '360°鼠标转向已': 'Mouse steering ', '开启': 'enabled',
  '暂无技能点，航行中每秒自动增加 10 点': 'No skill points yet. Earn 10 per second while sailing.',
  '秒后 +1 点）': ' sec)', '自动拾取：': 'Collected: ', ' 已收入船舱': ' added to hold',
  '已强化：': 'Upgraded: ', '暴击摧毁': 'Critical takedown', '你把这片海域变成了机械坟场，但怒潮仍不会停。': 'You turned this sea into a machine graveyard, but the tide goes on.',
  '渔船的灯熄灭了，声呐上只剩潮汐的杂音。': 'The vessel lights went dark. Only the tide remains on sonar.',
  '大海收回了它的铁皮。下一次，记得带着补给回来。': 'The sea has reclaimed its rusted prize. Bring supplies next time.',
  '没有可导出的存档进度': 'No progress to export', '画质已切换为': 'Quality set to ',
  '未找到游戏画布。': 'Game canvas not found.', '请确认浏览器支持 WebGL2，并尝试使用最新版 Chrome / Edge / Firefox。': 'Make sure your browser supports WebGL2 and try the latest Chrome, Edge, or Firefox.',
};

const dynamicEnglish: Array<[RegExp, string]> = [
  [/^等级提升至 (\d+)，获得强化点（当前可用 (\d+) 点）$/, 'Level up: $1 · $2 skill points available'],
  [/^航行历练：技能点 \+(\d+)（每分钟 \+2 · 当前可用 (\d+) 点，按 U 加点）$/, 'Sailing bonus: +$1 skill points · $2 available · press U to spend'],
  [/^威胁 (\d+)$/, 'Threats $1'], [/^击杀 (\d+)$/, 'Kills $1'],
  [/^技能点 \+10\/秒 · (\d+)s$/, 'Skill points +10/sec · $1s'],
  [/^觉醒 (\d+(?:\.\d+)?)s$/, 'Awakened $1s'], [/^秒杀半径 30m$/, 'Takedown radius 30m'],
  [/^半径 30m \/ (\d+(?:\.\d+)?)s$/, '30m radius / $1s'],
  [/^自动拾取：(.+) ×(\d+) 已收入船舱$/, 'Collected: $1 ×$2 added to hold'],
  [/^存档已载入 · LV (\d+) · (\d+) 击杀$/, 'Save loaded · LV $1 · $2 kills'],
  [/^TXT 文本存档已导出 \(LV (\d+)\)$/, 'TXT save exported (LV $1)'],
  [/^已强化：(.+) \(Lv\.(\d+)\)$/, 'Upgraded: $1 (Lv. $2)'],
  [/^热力觉醒：(\d+) 米范围秒杀，持续 (\d+(?:\.\d+)?) 秒$/, 'Heat Awakening: takedown within $1 m for $2 sec'],
  [/^机械章鱼已摧毁！\+(\d+) XP$/, 'Mech Octopus destroyed! +$1 XP'],
  [/^热力每秒自动 \+3%，技能点每分钟自动 \+2$/, 'Heat charges +3%/sec; skill points +10/sec'],
  [/^热力每秒自动 \+3%，技能点每秒自动 \+10$/, 'Heat charges +3%/sec; skill points +10/sec'],
  [/^(自动攻击|自动反击|360°鼠标转向)已(开启|关闭)$/, '$1 $2'],
  [/^鼠标瞄准已就绪 · 船头鼠标转向默认关闭（按 M 开启）· 自动攻击\(F\) · 自动反击\(G\)$/, 'Mouse aiming is ready · pointer steering is off by default (press M to enable) · auto attack (F) · counterattack (G)'],
  [/^等级 (\d+) \/ (\d+) XP$/, 'Level $1 / $2 XP'],
  [/^LV (\d+) · (\d+) 击杀 · (.+)$/, 'LV $1 · $2 kills · $3'],
  [/^(\d+)% 减伤$/, '$1% damage reduction'],
  [/^\+(\d+) 最大船体$/, '+$1 max hull'],
  [/^\+(\d+)% 武器伤害$/, '+$1% weapon damage'],
  [/^\+(\d+)% 攻击速度$/, '+$1% fire rate'],
  [/^(\d+)% 暴击率$/, '$1% critical chance'],
  [/^\+(\d+)% 移动速度$/, '+$1% movement speed'],
  [/^下一级：(.*)$/, 'Next: $1'],
  [/^等级 (\d+)$/, 'Level $1'],
  [/^技能点 \+10\/秒 · (\d+(?:\.\d+)?)s$/, 'Skill points +10/sec · $1s'],
  [/^最近存档：(.+)$/, 'Latest save: $1'],
  [/^(\d+) \/ (\d+) 格$/, '$1 / $2 slots'],
  [/^30 米内机械海兽瞬间熔毁 · (\d+(?:\.\d+)?) 秒$/, 'Destroys sea creatures within 30 m · $1 sec'],
  [/^⚡反击 · (.+)$/, '⚡Counter · $1'],
  [/^◎自动 · (.+)$/, '◎Auto · $1'],
  [/^RAT TIDE 启动失败\n\n(.+)\n\n请确认浏览器支持 WebGL2，并尝试使用最新版 Chrome \/ Edge \/ Firefox。$/, 'RAT TIDE failed to start\n\n$1\n\nMake sure your browser supports WebGL2 and try the latest Chrome, Edge, or Firefox.'],
];

const preferredLanguage = (navigator.languages?.[0] ?? navigator.language ?? 'zh-CN').toLowerCase();
export const locale: Locale = preferredLanguage.startsWith('en') ? 'en' : 'zh-CN';

export function t(source: string): string {
  if (locale !== 'en') return source;
  const direct = english[source];
  if (direct) return direct;
  for (const [pattern, replacement] of dynamicEnglish) {
    const match = source.match(pattern);
    if (match) {
      return replacement.replace(/\$(\d+)/g, (_placeholder, index: string) => {
        const captured = match[Number(index)] ?? '';
        if (english[captured]) return english[captured];
        if (captured === '开启') return 'enabled';
        if (captured === '关闭') return 'disabled';
        return captured;
      });
    }
  }
  return source;
}

export function applyBrowserLanguage(root: ParentNode = document): void {
  document.documentElement.lang = locale === 'en' ? 'en' : 'zh-CN';
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const original = node.nodeValue ?? '';
    const trimmed = original.trim();
    if (!trimmed) continue;
    const translated = t(trimmed);
    if (translated !== trimmed) {
      const start = original.indexOf(trimmed);
      node.nodeValue = `${original.slice(0, start)}${translated}${original.slice(start + trimmed.length)}`;
    }
  }

  root.querySelectorAll<HTMLElement>('[title], [placeholder], [aria-label]').forEach((element) => {
    for (const attribute of ['title', 'placeholder', 'aria-label']) {
      const value = element.getAttribute(attribute);
      if (value) element.setAttribute(attribute, t(value));
    }
  });
}
