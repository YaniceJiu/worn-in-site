/* copykit.js — 香料配方 + 香语文案引擎（英文取值版）
   ────────────────────────────────────────────────────────────────
   改词表时请遵守：
   · 香料名一律保留中文当「键」：SPICE_EN / SPICE_IMG / SPICE_COLOR / IMAGE_B / RECIPES 香料表
     —— 这些是拿 GPT 配方的香料列表去查的，翻了就查不到。
   · 颜色、面料、印花、款式、风格、变种、意象 一律英文取值 ——
     GPT 提示词也按同一套英文枚举返回，两边必须一致。
   ──────────────────────────────────────────────────────────────── */
const STYLE_DEFS=[
  {name:'wild',emoji:'🌿',
   g:{},c:{'black':1,'brown':1,'camel':1,'wine red':0.5},p:{'leopard/animal print':3},f:{'leather':3,'fleece':1},
   top:['小豆蔻','柑橘','粉红胡椒'],mid:['皮革','藏红花','焚香','黑醋栗芽'],base:['乳香','广藿香','琥珀','烟草木']},
  {name:'sweet',emoji:'🍬',
   g:{'short skirt':1,'dress':1},c:{'pink':2,'rose red':2,'light pink':2,'white':1,'light grey':1,'lilac':1,'cream':1},p:{'polka dot':3,'floral':2},f:{'silk/satin':1},
   top:['青草','樱花','蜜桃','橙花'],mid:['紫罗兰','乳香','栀子花','棉花糖'],base:['香草','白木','鸢尾脂']},
  {name:'sporty',emoji:'🏃',
   g:{'sweatshirt/sweater':2,'tee/top':2,'top':2,'shorts':2,'tank':1},c:{'black':0.5,'white':0.5,'blue':0.5,'navy':0.5,'sky blue':0.5,'light blue':0.5,'denim blue':0.5},p:{'stripe':1},f:{'tech/sport fabric':3,'denim':1.5},
   top:['甜橙','野莓','葡萄柚','薄荷'],mid:['依兰','广藿香','海水'],base:['岩兰草','松针','肉豆蔻']},
  {name:'office',emoji:'👔',
   g:{'shirt':3,'jacket':3},c:{'black':1,'white':1,'grey':1,'dark grey':1,'navy':1,'dark blue':1},p:{'check':2,'stripe':1},f:{'cotton':0.5},
   top:['白茶','佛手柑','绿叶'],mid:['橡木苔','天竺葵','雪松'],base:['白麝香','香根草','龙涎香醚']},
  {name:'natural/home',emoji:'🏡',
   g:{'dress':1,'sweatshirt/sweater':1,'long dress':1},c:{'beige':2,'khaki':2,'green':2,'olive':2,'deep olive':2,'army green':2,'light green':1.5,'brown':2,'cream':1,'camel':1},p:{'floral':1,'solid':0.5},f:{'linen':3,'fleece':2,'knit/sweater':2,'denim':0.5},
   top:['柑橘','郁金香','无花果叶','竹叶'],mid:['白茶','白麝香','铃兰','小黄瓜','松针'],base:['橡木','香葵子','苔藓']},
  {name:'evening',emoji:'👗',
   g:{'dress':1.5,'long dress':1.5},c:{'black':1,'navy':1,'dark blue':1,'purple':1,'wine red':0.5,'dark grey':0.5},p:{'solid':0.5},f:{'silk/satin':2},
   top:['小苍兰','海洋','乌龙','香槟气泡'],mid:['白茶','仙客来','玫瑰净油','木兰'],base:['檀木','零陵香豆','麝香酮','鸢尾根']},
];

// ============================================================
//  6 大风格 × 3 变种 = 18 配方（变种 = 原配方微调，按属性自动选 + 随机兜底）
// ============================================================
const RECIPES={
  'wild':{
    'meadow':{top:['柑橘','小豆蔻'],mid:['藏红花','皮革'],base:['烟草木','乳香','琥珀']},
    'biker':{top:['小豆蔻','粉红胡椒'],mid:['皮革','藏红花','黑醋栗芽'],base:['琥珀','烟草木','广藿香']},
    'nightfall':{top:['粉红胡椒','黑醋栗芽'],mid:['焚香','皮革'],base:['乳香','琥珀','广藿香']}
  },
  'office':{
    'meeting':{top:['白茶','佛手柑'],mid:['雪松','橡木苔'],base:['白麝香','香根草']},
    'coffee':{top:['白茶','绿叶'],mid:['天竺葵','雪松'],base:['白麝香','檀木','龙涎香醚']},
    'weekend':{top:['佛手柑','绿叶'],mid:['天竺葵','橡木苔'],base:['香根草','龙涎香醚']}
  },
  'sweet':{
    'candy':{top:['蜜桃','橙花','樱花'],mid:['棉花糖','栀子花','乳香'],base:['香草','白木']},
    'fruity floral':{top:['樱花','橙花','蜜桃'],mid:['栀子花','紫罗兰'],base:['鸢尾脂','白木']},
    'delicate':{top:['青草','樱花'],mid:['紫罗兰','乳香'],base:['白木','鸢尾脂']}
  },
  'sporty':{
    'sea salt':{top:['野莓','薄荷'],mid:['海水','依兰'],base:['岩兰草','松针']},
    'forest':{top:['甜橙','葡萄柚','薄荷'],mid:['松针','广藿香'],base:['岩兰草','肉豆蔻']},
    'mint':{top:['薄荷','甜橙'],mid:['依兰','海水'],base:['岩兰草','松针']}
  },
  'natural/home':{
    'after rain':{top:['竹叶','郁金香','无花果叶'],mid:['小黄瓜','铃兰','白茶'],base:['苔藓','橡木']},
    'warm wood':{top:['柑橘','无花果叶'],mid:['白麝香','白茶'],base:['橡木','香葵子','苔藓']},
    'tea':{top:['柑橘','郁金香'],mid:['白茶','铃兰','松针'],base:['香葵子','橡木']}
  },
  'evening':{
    'rose':{top:['小苍兰','乌龙'],mid:['玫瑰净油','木兰'],base:['檀木','鸢尾根']},
    'champagne':{top:['香槟气泡','小苍兰','乌龙'],mid:['白茶','仙客来'],base:['零陵香豆','麝香酮']},
    'oriental':{top:['乌龙','海洋'],mid:['玫瑰净油','仙客来'],base:['檀木','零陵香豆','麝香酮','鸢尾根']}
  }
};
// 变种选择：按「最强属性」分流（常见来源按冷暖/深浅拆），无强信号随机兜底
function pickVariant(styleName,attrs){
  const style=RECIPES[styleName]; if(!style) return null;
  const names=Object.keys(style);
  const c=attrs.color||'', p=attrs.print||'', f=attrs.fabric||'', g=attrs.garment||'';
  const warm=['brown','camel','khaki','beige','dark brown','cream','orange','yellow','wine red'];
  const cool=['black','dark grey','grey','navy','dark blue','blue','sky blue','light blue','denim blue','light grey','white'];
  const light=['white','light grey','light pink','beige','cream','light blue','sky blue','lilac'];
  const dark=['black','dark grey','navy','dark blue','dark green','deep olive','dark brown','wine red','deep purple'];
  const blue=['blue','sky blue','light blue','navy','dark blue','denim blue'];
  const green=['green','light green','dark green','olive','deep olive','army green'];
  const warmTone=['brown','camel','khaki','beige','cream','orange','yellow','dark brown'];
  const pink=['pink','light pink','rose red'];
  const red=['red','rose red','wine red'];
  const any=()=>names[Math.floor(Math.random()*names.length)];
  if(styleName==='wild'){
    if(p==='leopard/animal print') return 'meadow';
    if(f==='leather') return warm.indexOf(c)>=0?'biker':'nightfall';   // 皮革按冷暖分流
    if(f==='fleece') return dark.indexOf(c)>=0?'nightfall':'biker';
    return any();
  }
  if(styleName==='office'){
    if(g==='shirt'||g==='jacket') return f==='cotton'?'coffee':(warm.indexOf(c)>=0?'weekend':'meeting');
    if(light.indexOf(c)>=0) return 'weekend';
    return any();
  }
  if(styleName==='sweet'){
    if(pink.indexOf(c)>=0) return 'candy';
    if(p==='floral'||p==='polka dot') return 'fruity floral';
    if(light.indexOf(c)>=0) return 'delicate';
    return any();
  }
  if(styleName==='sporty'){
    if(blue.indexOf(c)>=0) return 'sea salt';
    if(green.indexOf(c)>=0) return 'forest';
    if(p==='stripe') return 'mint';
    return any();
  }
  if(styleName==='natural/home'){
    if(green.indexOf(c)>=0) return 'after rain';
    if(f==='linen') return 'tea';
    if(warmTone.indexOf(c)>=0) return 'warm wood';
    return any();
  }
  if(styleName==='evening'){
    if(red.indexOf(c)>=0) return 'rose';
    if(light.indexOf(c)>=0) return 'champagne';
    if(dark.indexOf(c)>=0) return 'oriental';
    return any();
  }
  return any();
}

// ============================================================
//  💌 香语文案：香料→英文气质词(A) / 意象→香料(B)
//     ⚠ 下面这张表的「键」是香料名，必须保持中文
// ============================================================
const SPICE_EN={
  '小豆蔻':'spicy cardamom','柑橘':'bright citrus','皮革':'tan leather','焚香':'smoky frankincense',
  '藏红花':'leathery saffron','橡木苔':'damp oakmoss','白茶':'silken white tea','紫罗兰':'powdered violet',
  '青草':'green grass','樱花':'airy cherry blossom','橙花':'zesty orange blossom','野莓':'juicy wild berry',
  '广藿香':'earthy patchouli','依兰':'creamy ylang','郁金香':'wet tulip','白麝香':'skin-soft white musk',
  '小苍兰':'dewy freesia','海水':'salty sea','海洋':'salty sea','仙客来':'soapy cyclamen',
  '乌龙':'tannic oolong','粉红胡椒':'prickly pink pepper','乳香':'charred incense','琥珀':'resinous amber',
  '雪松':'dry cedar','香根草':'dry vetiver','岩兰草':'dry vetiver','蜜桃':'fuzzy peach',
  '栀子花':'buttery gardenia','香草':'burnt vanilla','薄荷':'cool mint','檀木':'milky sandalwood',
  '烟草木':'embered tobacco','棉花糖':'spun-sugar marshmallow','零陵香豆':'honeyed tonka','橡木':'rain-washed oak',
  '无花果叶':'green fig leaf','竹叶':'dewy bamboo','铃兰':'dewy lily of the valley','小黄瓜':'cool cucumber',
  '香葵子':'musk ambrette','松针':'rain-fresh pine needle','苔藓':'velvet moss',
  '黑醋栗芽':'inky blackcurrant bud','佛手柑':'bright bergamot','绿叶':'crushed green leaf',
  '天竺葵':'leafy geranium','龙涎香醚':'suede-soft ambroxan','白木':'pale white wood','鸢尾脂':'buttery orris butter',
  '甜橙':'sunny sweet orange','葡萄柚':'tangy grapefruit','肉豆蔻':'warm nutmeg','玫瑰净油':'velvet rose absolute',
  '木兰':'creamy magnolia','鸢尾根':'powdery orris root','香槟气泡':'fizzing champagne','麝香酮':'sensual muscone'
};
// 意象(B) → 香料（值同样是中文香料名，不要翻译）
const IMAGE_B={
  'rain':'仙客来','Ocean mist':'海水','Morning haze':'青草','caramel':'香草','desert rain':'岩兰草',
  'fog':'焚香','Salt breeze':'海水','honey':'蜜桃','iron':'藏红花','ice':'薄荷','Quiet library dust':'香根草',
  'sugar':'棉花糖','Rain on dry earth':'广藿香','wind':'雪松','stone':'零陵香豆',
  'Sun-warmed bark':'橡木','Candle glow':'琥珀','Ash from incense':'檀木','Dew on glass':'小苍兰','moss':'橡木苔','bark':'雪松',
  'brine':'海水','cream':'栀子花','peat':'广藿香','flint':'粉红胡椒','cocoa':'零陵香豆',
  'Green flecks in golden dough':'小豆蔻','tar':'烟草木','Cloud drift':'白麝香',
  'Forest shadow':'橡木苔','Velvet dusk':'檀木','Honeycomb drip':'蜜桃'
};
// 材质 → 意象(B)（键是英文材质，与 GPT 返回的 fabric 一致）
const MATERIAL_B={'leather':'iron','denim':'stone','knit/sweater':'Ash from incense','cotton':'Cloud drift','silk/satin':'Dew on glass','linen':'Morning haze','tech/sport fabric':'wind','fleece':'Cloud drift'};

// ============================================================
//  适用情景规则（生成文案时按条件过滤模板）
// ============================================================
const SOFT_FABRIC=['cotton','silk/satin','linen','knit/sweater','fleece'];              // 可「亲手触摸」
const SCENT_FABRIC=['cotton','silk/satin','linen','knit/sweater','fleece','leather'];   // 可「留香」
const DISTINCT_PRINT=['leopard/animal print','tie-dye','floral','check'];               // 可用「用这个印花的人不多」
const ALL_PRINT=['leopard/animal print','tie-dye','floral','check','stripe','polka dot']; // 有花纹
const PRINT_IMG={'floral':'Morning haze','polka dot':'Dew on glass','check':'Quiet library dust','stripe':'Ocean mist','tie-dye':'Cloud drift','leopard/animal print':'Forest shadow'};
// 香料 → 可配颜色（键=香料名保持中文；值=英文色名，必须与 GPT 的 color name 一致）
const SPICE_COLOR={
  // ── 野性 / 皮革 / 焚香 ──
  '皮革':['black','dark grey','grey','dark brown','brown','khaki','navy','dark blue','denim blue'],
  '烟草木':['black','dark grey','dark brown','brown','wine red'],
  '藏红花':['black','dark grey','wine red','red','rose red','brown'],
  '焚香':['black','dark grey','wine red','red','deep purple'],
  '乳香':['black','dark grey','grey','brown','khaki'],
  '琥珀':['black','dark grey','dark brown','brown','camel','khaki','beige','orange','yellow','wine red'],
  '广藿香':['black','dark grey','dark brown','brown','dark green','army green','olive','deep olive'],
  '黑醋栗芽':['black','dark grey','wine red','deep purple','purple'],
  '粉红胡椒':['black','dark grey','wine red','rose red','pink','orange','khaki'],
  '小豆蔻':['brown','khaki','beige','orange','yellow','dark green','olive'],
  // ── 办公 / 木质 / 茶 ──
  '雪松':['black','dark grey','grey','light grey','brown','navy','dark blue'],
  '香根草':['black','dark grey','grey','light grey','khaki','brown','dark brown'],
  '橡木':['dark brown','brown','camel','khaki','dark green','olive','army green'],
  '橡木苔':['dark green','olive','army green','deep olive','dark grey','grey'],
  '苔藓':['dark green','olive','army green','green','deep olive'],
  '香葵子':['dark green','olive','army green','dark grey'],
  '檀木':['black','dark brown','brown','khaki','beige','navy','dark blue','deep purple'],
  '白木':['white','light grey','grey','beige','cream','light pink','lilac'],
  '龙涎香醚':['white','light grey','grey','beige','light blue','sky blue','lilac','light pink'],
  '乌龙':['black','dark grey','brown','dark brown','wine red','navy','dark blue','deep purple'],
  '白茶':['white','light grey','grey','beige','cream','light pink','lilac'],
  '佛手柑':['orange','yellow','cream','beige','light green','green'],
  '绿叶':['green','light green','dark green','olive','army green','khaki'],
  '天竺葵':['pink','rose red','light pink','red'],
  '柑橘':['orange','yellow','cream','beige','light green','green'],
  // ── 甜美 / 花香 ──
  '樱花':['pink','light pink','white','light grey','rose red'],
  '橙花':['white','light pink','beige','cream','light grey','pink'],
  '蜜桃':['pink','light pink','rose red','beige','cream','orange'],
  '栀子花':['white','light pink','beige','cream','pink','light grey'],
  '棉花糖':['white','light pink','pink','light grey','beige'],
  '香草':['beige','cream','brown','khaki','orange','pink','light pink'],
  '紫罗兰':['deep purple','purple','lilac','wine red','rose red'],
  '鸢尾脂':['lilac','purple','light pink','beige','cream','white','light grey'],
  '鸢尾根':['deep purple','purple','lilac','navy','dark blue','light grey','grey'],
  '依兰':['pink','light pink','lilac','beige'],
  '郁金香':['pink','rose red','red','orange','yellow','green'],
  '铃兰':['white','light grey','light green','sky blue','light blue','lilac'],
  '小苍兰':['white','light grey','sky blue','light blue','lilac','light green'],
  '仙客来':['pink','light pink','lilac','white','light grey'],
  '木兰':['white','light pink','beige','cream','light grey'],
  '玫瑰净油':['rose red','red','wine red','deep purple','pink'],
  '青草':['green','light green','dark green','olive','army green','khaki'],
  '无花果叶':['dark green','olive','army green','green','light green'],
  '竹叶':['green','light green','dark green','olive'],
  '小黄瓜':['light green','green','light blue','sky blue','white'],
  // ── 运动 / 海洋 / 薄荷 ──
  '海水':['blue','sky blue','light blue','navy','dark blue','denim blue','white'],
  '海洋':['blue','sky blue','light blue','navy','dark blue','denim blue'],
  '薄荷':['light green','green','sky blue','light blue','white','light grey'],
  '野莓':['rose red','red','wine red','deep purple','purple'],
  '甜橙':['orange','yellow','cream','beige'],
  '葡萄柚':['orange','yellow','cream','light green','green','light blue'],
  '岩兰草':['brown','khaki','olive','army green','denim blue','blue'],
  '松针':['dark green','olive','army green','green','dark blue','navy'],
  '肉豆蔻':['brown','dark brown','khaki','beige','wine red','orange'],
  // ── 名媛 / 甜香 ──
  '香槟气泡':['white','light grey','beige','cream','light blue','sky blue','lilac'],
  '麝香酮':['black','dark grey','dark brown','navy','dark blue','deep purple'],
  '零陵香豆':['brown','khaki','beige','dark brown','wine red','orange'],
  '白麝香':['white','light grey','grey','beige','cream','light pink','lilac']
};
// 颜色 → 意象（颜色句用，贴合颜色调性）
const COLOR_IMG={
  'black':'Ash from incense','dark grey':'Ash from incense','grey':'Morning haze','light grey':'Morning haze','white':'Cloud drift','light pink':'Cloud drift',
  'red':'Candle glow','wine red':'Candle glow','rose red':'Candle glow','pink':'Honeycomb drip',
  'orange':'Candle glow','yellow':'Candle glow','cream':'caramel',
  'dark brown':'Sun-warmed bark','brown':'Sun-warmed bark','camel':'Sun-warmed bark','khaki':'Sun-warmed bark','beige':'Sun-warmed bark',
  'green':'Morning haze','light green':'Morning haze','dark green':'Forest shadow','olive':'Forest shadow','deep olive':'Forest shadow','army green':'Forest shadow',
  'blue':'Ocean mist','sky blue':'Ocean mist','light blue':'Ocean mist','navy':'Ocean mist','dark blue':'Ocean mist','denim blue':'Ocean mist',
  'purple':'Velvet dusk','deep purple':'Velvet dusk','lilac':'Velvet dusk'
};
// 香料 → 意象（香味句用：意象必须跟香料同调，不能小豆蔻配风）—— 键保持中文
const SPICE_IMG={
  '小豆蔻':'flint','柑橘':'Sun-warmed bark','皮革':'iron','焚香':'Ash from incense',
  '藏红花':'Scarlet Velvet','橡木苔':'moss','白茶':'Dew on glass','紫罗兰':'Cloud drift',
  '青草':'Morning haze','樱花':'Honeycomb drip','橙花':'Honeycomb drip','野莓':'jam',
  '广藿香':'Rain on dry earth','依兰':'cream','郁金香':'Dew on glass','白麝香':'Cloud drift',
  '小苍兰':'Dew on glass','海水':'Ocean mist','海洋':'Ocean mist','仙客来':'Dew on glass',
  '乌龙':'Candle glow','粉红胡椒':'flint','乳香':'Pine resin','琥珀':'Candle glow',
  '雪松':'Sun-warmed bark','香根草':'Quiet library dust','岩兰草':'desert rock','蜜桃':'Honeycomb drip',
  '栀子花':'cream','香草':'caramel','薄荷':'ice','檀木':'Sun-warmed bark',
  '烟草木':'Ash from incense','棉花糖':'Cloud drift','零陵香豆':'Sun-warmed bark','橡木':'Sun-warmed bark',
  '无花果叶':'Forest shadow','竹叶':'Morning haze','铃兰':'Dew on glass','小黄瓜':'ice',
  '香葵子':'moss','松针':'Forest shadow','苔藓':'Forest shadow',
  '黑醋栗芽':'brine','佛手柑':'Sun-warmed bark','绿叶':'Morning haze','天竺葵':'Candle glow','龙涎香醚':'Cloud drift',
  '白木':'Cloud drift','鸢尾脂':'Cloud drift','甜橙':'Honeycomb drip','葡萄柚':'Dew on glass','肉豆蔻':'Rain on dry earth',
  '玫瑰净油':'Velvet dusk','木兰':'cream','鸢尾根':'Velvet dusk','香槟气泡':'Dew on glass','麝香酮':'Cloud drift'
};

// 意象(B) → 英文单词（拼进英文句子；键是 IMAGE_B 里的英文意象名）
const IMAGE_B_EN={'rain':'rain','Ocean mist':'sea mist','Morning haze':'morning haze','caramel':'caramel','desert rain':'desert rain','fog':'fog','Salt breeze':'salt breeze','honey':'honey','iron':'iron','ice':'ice','Quiet library dust':'library dust','sugar':'sugar','Rain on dry earth':'rain on dry earth','wind':'wind','stone':'stone','Sun-warmed bark':'sun-warmed bark','Candle glow':'candle glow','Ash from incense':'incense ash','Dew on glass':'dew on glass','moss':'moss','bark':'bark','brine':'brine','cream':'cream','peat':'peat','flint':'flint','cocoa':'cocoa','Green flecks in golden dough':'green flecks in golden dough','tar':'tar','Cloud drift':'drifting cloud','Forest shadow':'forest shadow','Velvet dusk':'velvet dusk','Honeycomb drip':'honeycomb drip','jam':'jam','Pine resin':'pine resin','desert rock':'desert rock','Scarlet Velvet':'scarlet velvet'};

// ============================================================
//  💌 句式素材池（英文；生成时随机抽选）
//  占位符：{col}颜色 {g}款式 {f}材质 {p}印花
//          {enSp}英文香料 {imgEN}意象英文
// ============================================================
const TEMPLATES={
  opening:['Oh — a guest.','There you are.','Just in time; I was blending.'],
  garment:[
    'This {g} suits you.',
    '{col} {g} — easy on the eye.',
    'This {g} has character.',
    '{g} — good taste.'
  ],
  material:[
    'That {f} feels lovely.',
    'I do like the feel of {f}.',
    '{f} — so comfortable.'
  ],
  color:[
    '{col}, like {imgEN}.',
    'That {col} is beautiful.',
    'Lovely {col}.',
    '{col} reminds me of {imgEN}.'
  ],
  printBold:['Leopard print — bold.'],
  printOther:['{p}, like {imgEN}.','{p} — rarely seen.'],
  scent:['A little {imgEN}, then.','{imgEN} would sit nicely.','{imgEN} — yes, that one.'],
  ending1:['There. Done.','Take your time with it.'],
  ending2:['There is a small sample you can add.']
};
const pick=arr=>arr[Math.floor(Math.random()*arr.length)];
const fill=(tpl,o)=>tpl.replace(/\{(col|g|enSp|imgEN|imgB|f|p)\}/g,(_,k)=>o[k]||'');
// 防相邻两句句法相同（连续抽中同一模板时换一个）
let lastTpl='';
const pickNR=pool=>{ if(pool.length<=1)return pool[0]; let t=pick(pool),g=0; while(t===lastTpl&&g<pool.length){t=pick(pool);g++;} lastTpl=t; return t; };

// 生成香语文案：1 开头 + 5 句中间（至少 1 句颜色）+ 2 收尾 = 8 句
// 每句用配方里「不同」的香料，返回 {t:文本, s:香料}，香料不重复且意象跟香料同调
function genCopy(a){
  const style=a.style||{};
  const all=[...(style.top||[]),...(style.mid||[]),...(style.base||[])];
  const colors=(a.colors||[]).filter(Boolean);
  const used=[];
  const take=(pref)=>{
    const order=[...(pref||[]),...all];
    for(const s of order){ if(used.indexOf(s)<0&&SPICE_EN[s]){used.push(s);return s;} }
    for(const s of all){ if(used.indexOf(s)<0){used.push(s);return s;} }
    return all[0]||'';
  };
  // 取一个「匹配指定颜色」的配方香料（SPICE_COLOR 色调表）；都不匹配才兜底
  const colorMatch=(col)=>{
    const matched=all.filter(s=>(SPICE_COLOR[s]||[]).indexOf(col)>=0);
    return matched.length?take(matched):take([]);
  };
  // 英文色名直接用，不再拼「色」字
  const colW=cn=>cn;
  const base={col:colors.length?colW(colors[0]):'',imgB:'wind',imgEN:'wind',g:'',f:'',p:'',enSp:''};
  const res=[]; // 每句 {t:文本, s:香料}
  const add=(t,s)=>res.push({t,s});
  const scentOf=(spice)=>{
    const img=SPICE_IMG[spice]||'wind';
    return fill(pickNR(TEMPLATES.scent),Object.assign({},base,{imgB:img,imgEN:IMAGE_B_EN[img]||img,enSp:SPICE_EN[spice]||spice}));
  };
  const slotLine=(slot)=>{
    const t=slot.type, lab=slot.label||'';
    if(t==='color'){
      const cw=colW(lab);
      const cImg=COLOR_IMG[lab]||'wind';
      // 颜色句必出：香料必须匹配当前颜色（SPICE_COLOR 色调表）
      const cSp=colorMatch(lab);
      const o=Object.assign({},base,{col:cw,imgB:cImg,imgEN:IMAGE_B_EN[cImg]||cImg,enSp:SPICE_EN[cSp]||cSp});
      return {t:fill(pickNR(TEMPLATES.color),o), s:cSp};
    }
    if(t==='print'){
      if(lab==='leopard/animal print') return {t:fill(pick(TEMPLATES.printBold),Object.assign({},base,{p:lab})), s:''};
      if(ALL_PRINT.indexOf(lab)>=0){
        const pImg=PRINT_IMG[lab]||'wind';
        const pSp=take([IMAGE_B[pImg]].filter(s=>all.indexOf(s)>=0));
        const pPool=TEMPLATES.printOther.filter(tp=>{ if(tp.indexOf('rarely seen')>=0)return DISTINCT_PRINT.indexOf(lab)>=0; return true; });
        return {t:fill(pickNR(pPool),Object.assign({},base,{p:lab,imgB:pImg,imgEN:IMAGE_B_EN[pImg]||pImg,enSp:SPICE_EN[pSp]||pSp})), s:pSp};
      }
      const sSp=take([]); // 纯色 → 香味句（意象跟香料走）
      return {t:scentOf(sSp), s:sSp};
    }
    if(t==='fabric'){
      const f=lab;
      const mSp=take([IMAGE_B[MATERIAL_B[f]||'wind']].filter(s=>all.indexOf(s)>=0));
      return {t:fill(pickNR(TEMPLATES.material),Object.assign({},base,{f})), s:mSp};
    }
    if(t==='garment'){
      const g=lab;
      const gPool=base.col?['This {g} suits you.','{col} {g} — easy on the eye.','This {g} has character.','{g} — good taste.']
        :['This {g} suits you.','This {g} has character.','{g} — good taste.'];
      const tpl=pickNR(gPool);
      // 款式句若带颜色（{col}），香料也要匹配该颜色
      const gSp=tpl.indexOf('{col}')>=0?colorMatch(base.col):take([]);
      const gImg=SPICE_IMG[gSp]||base.imgB;
      const gImgEN=IMAGE_B_EN[gImg]||base.imgEN;
      return {t:fill(tpl,Object.assign({},base,{g,imgB:gImg,imgEN:gImgEN,enSp:SPICE_EN[gSp]||gSp})), s:gSp};
    }
    if(t==='scent'){ const sSp=take([]); return {t:scentOf(sSp), s:sSp}; }
    return null;
  };
  add(pick(TEMPLATES.opening),'');
  // 中间 5 句：至少 1 句颜色，其余取匹配度最高的属性槽，不足补颜色/香味
  const colorSlots=colors.map((cn,i)=>({type:'color',label:cn,score:1-i*0.06}));
  const attrSlots=(a.slots||[]).filter(s=>s&&s.label).sort((x,y)=>y.score-x.score);
  const chosen=[colorSlots[0]];
  for(const s of attrSlots){ if(chosen.length>=4)break; chosen.push(s); }
  let ci=1;
  while(chosen.length<4&&ci<colorSlots.length){ chosen.push(colorSlots[ci++]); }
  while(chosen.length<4){ chosen.push({type:'scent'}); }
  for(const slot of chosen){
    let item=slotLine(slot);
    if(!item){ const fSp=take([]); item={t:scentOf(fSp), s:fSp}; } // 无适用模板时用香味句补足
    add(item.t,item.s);
  }
  // 5 句中段最后一句固定为「最后加点{香料}」
  const lastSp=take([]);
  add('And a final touch of '+(SPICE_EN[lastSp]||lastSp)+'.', lastSp);
  // 收尾（两句）
  add(fill(pick(TEMPLATES.ending1),base),'');
  add(fill(TEMPLATES.ending2[0],base),'');
  return res;
}


/* ---- Worn-In 封装：给 play.js 用的入口 ---- */
function attrSlotsFor(g){
  const slots=[];
  if(g.garment) slots.push({type:'garment',label:g.garment,score:3});
  if(g.fabric)  slots.push({type:'fabric', label:g.fabric, score:2.6});
  if(g.pattern && g.pattern!=='solid') slots.push({type:'print', label:g.pattern, score:2.2});
  return slots;
}
// g.style = {top,mid,base} 六风格香料池; g.colors = 英文色名数组; 返回 8 行 [{t,s}]
function makeCopy(g){
  const a={style:g.style||{}, colors:g.colors||[], slots:attrSlotsFor(g)};
  return genCopy(a);
}
window.COPY={RECIPES,STYLE_DEFS,pickVariant,makeCopy,SPICE_EN,SPICE_IMG,IMAGE_B,IMAGE_B_EN,MATERIAL_B,PRINT_IMG,SPICE_COLOR,COLOR_IMG};
