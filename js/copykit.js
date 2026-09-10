/* copykit.js — 从 衣橱变变变/四特征分析器.html 原样移植的香料配方+香语文案引擎 */
const STYLE_DEFS=[
  {name:'野性风',emoji:'🌿',
   g:{},c:{'黑色':1,'棕色':1,'驼色':1,'酒红':0.5},p:{'豹纹/动物纹':3},f:{'皮革':3,'毛绒':1},
   top:['小豆蔻','柑橘','粉红胡椒'],mid:['皮革','藏红花','焚香','黑醋栗芽'],base:['乳香','广藿香','琥珀','烟草木']},
  {name:'甜美少女',emoji:'🍬',
   g:{'短裙':1,'连衣裙':1},c:{'粉色':2,'玫红':2,'浅粉':2,'白色':1,'浅灰':1,'淡紫':1,'米黄':1},p:{'波点':3,'碎花':2},f:{'丝绸/缎面':1},
   top:['青草','樱花','蜜桃','橙花'],mid:['紫罗兰','乳香','栀子花','棉花糖'],base:['香草','白木','鸢尾脂']},
  {name:'运动风',emoji:'🏃',
   g:{'卫衣/毛衣':2,'T恤/上衣':2,'上衣':2,'短裤':2,'背心':1},c:{'黑色':0.5,'白色':0.5,'蓝色':0.5,'藏青':0.5,'天蓝':0.5,'浅蓝':0.5,'牛仔蓝':0.5},p:{'条纹':1},f:{'科技/运动面料':3,'牛仔':1.5},
   top:['甜橙','野莓','葡萄柚','薄荷'],mid:['依兰','广藿香','海水'],base:['岩兰草','松针','肉豆蔻']},
  {name:'办公风格',emoji:'👔',
   g:{'衬衫':3,'外套/夹克':3},c:{'黑色':1,'白色':1,'灰色':1,'深灰':1,'藏青':1,'深蓝':1},p:{'格纹':2,'条纹':1},f:{'棉':0.5},
   top:['白茶','佛手柑','绿叶'],mid:['橡木苔','天竺葵','雪松'],base:['白麝香','香根草','龙涎香醚']},
  {name:'森系居家',emoji:'🏡',
   g:{'连衣裙':1,'卫衣/毛衣':1,'长裙':1},c:{'米色':2,'卡其':2,'绿色':2,'橄榄绿':2,'暗橄榄绿':2,'军绿':2,'浅绿':1.5,'棕色':2,'米黄':1,'驼色':1},p:{'碎花':1,'纯色':0.5},f:{'棉麻/亚麻':3,'毛绒':2,'针织/毛衣':2,'牛仔':0.5},
   top:['柑橘','郁金香','无花果叶','竹叶'],mid:['白茶','白麝香','铃兰','小黄瓜','松针'],base:['橡木','香葵子','苔藓']},
  {name:'晚礼服/名媛',emoji:'👗',
   g:{'连衣裙':1.5,'长裙':1.5},c:{'黑色':1,'藏青':1,'深蓝':1,'紫色':1,'酒红':0.5,'深灰':0.5},p:{'纯色':0.5},f:{'丝绸/缎面':2},
   top:['小苍兰','海洋','乌龙','香槟气泡'],mid:['白茶','仙客来','玫瑰净油','木兰'],base:['檀木','零陵香豆','麝香酮','鸢尾根']},
];

// ============================================================
//  6 大风格 × 3 变种 = 18 配方（变种 = 原配方微调，按属性自动选 + 随机兜底）
// ============================================================
const RECIPES={
  '野性风':{
    '原野':{top:['柑橘','小豆蔻'],mid:['藏红花','皮革'],base:['烟草木','乳香','琥珀']},
    '机车':{top:['小豆蔻','粉红胡椒'],mid:['皮革','藏红花','黑醋栗芽'],base:['琥珀','烟草木','广藿香']},
    '暗夜':{top:['粉红胡椒','黑醋栗芽'],mid:['焚香','皮革'],base:['乳香','琥珀','广藿香']}
  },
  '办公风格':{
    '会议':{top:['白茶','佛手柑'],mid:['雪松','橡木苔'],base:['白麝香','香根草']},
    '咖啡':{top:['白茶','绿叶'],mid:['天竺葵','雪松'],base:['白麝香','檀木','龙涎香醚']},
    '周末':{top:['佛手柑','绿叶'],mid:['天竺葵','橡木苔'],base:['香根草','龙涎香醚']}
  },
  '甜美少女':{
    '糖果':{top:['蜜桃','橙花','樱花'],mid:['棉花糖','栀子花','乳香'],base:['香草','白木']},
    '花果':{top:['樱花','橙花','蜜桃'],mid:['栀子花','紫罗兰'],base:['鸢尾脂','白木']},
    '淡雅':{top:['青草','樱花'],mid:['紫罗兰','乳香'],base:['白木','鸢尾脂']}
  },
  '运动风':{
    '海盐':{top:['野莓','薄荷'],mid:['海水','依兰'],base:['岩兰草','松针']},
    '森林':{top:['甜橙','葡萄柚','薄荷'],mid:['松针','广藿香'],base:['岩兰草','肉豆蔻']},
    '薄荷':{top:['薄荷','甜橙'],mid:['依兰','海水'],base:['岩兰草','松针']}
  },
  '森系居家':{
    '雨后':{top:['竹叶','郁金香','无花果叶'],mid:['小黄瓜','铃兰','白茶'],base:['苔藓','橡木']},
    '暖木':{top:['柑橘','无花果叶'],mid:['白麝香','白茶'],base:['橡木','香葵子','苔藓']},
    '茶香':{top:['柑橘','郁金香'],mid:['白茶','铃兰','松针'],base:['香葵子','橡木']}
  },
  '晚礼服/名媛':{
    '玫瑰':{top:['小苍兰','乌龙'],mid:['玫瑰净油','木兰'],base:['檀木','鸢尾根']},
    '香槟':{top:['香槟气泡','小苍兰','乌龙'],mid:['白茶','仙客来'],base:['零陵香豆','麝香酮']},
    '东方':{top:['乌龙','海洋'],mid:['玫瑰净油','仙客来'],base:['檀木','零陵香豆','麝香酮','鸢尾根']}
  }
};
// 变种选择：按「最强属性」分流（常见来源按冷暖/深浅拆），无强信号随机兜底
function pickVariant(styleName,attrs){
  const style=RECIPES[styleName]; if(!style) return null;
  const names=Object.keys(style);
  const c=attrs.color||'', p=attrs.print||'', f=attrs.fabric||'', g=attrs.garment||'';
  const warm=['棕色','驼色','卡其','米色','深棕','米黄','橙色','黄色','酒红'];
  const cool=['黑色','深灰','灰色','藏青','深蓝','蓝色','天蓝','浅蓝','牛仔蓝','浅灰','白色'];
  const light=['白色','浅灰','浅粉','米色','米黄','浅蓝','天蓝','淡紫'];
  const dark=['黑色','深灰','藏青','深蓝','墨绿','暗橄榄绿','深棕','酒红','深紫'];
  const blue=['蓝色','天蓝','浅蓝','藏青','深蓝','牛仔蓝'];
  const green=['绿色','浅绿','墨绿','橄榄绿','暗橄榄绿','军绿'];
  const warmTone=['棕色','驼色','卡其','米色','米黄','橙色','黄色','深棕'];
  const pink=['粉色','浅粉','玫红'];
  const red=['红色','玫红','酒红'];
  const any=()=>names[Math.floor(Math.random()*names.length)];
  if(styleName==='野性风'){
    if(p==='豹纹/动物纹') return '原野';
    if(f==='皮革') return warm.indexOf(c)>=0?'机车':'暗夜';   // 皮革按冷暖分流
    if(f==='毛绒') return dark.indexOf(c)>=0?'暗夜':'机车';
    return any();
  }
  if(styleName==='办公风格'){
    if(g==='衬衫'||g==='外套/夹克') return f==='棉'?'咖啡':(warm.indexOf(c)>=0?'周末':'会议');
    if(light.indexOf(c)>=0) return '周末';
    return any();
  }
  if(styleName==='甜美少女'){
    if(pink.indexOf(c)>=0) return '糖果';
    if(p==='碎花'||p==='波点') return '花果';
    if(light.indexOf(c)>=0) return '淡雅';
    return any();
  }
  if(styleName==='运动风'){
    if(blue.indexOf(c)>=0) return '海盐';
    if(green.indexOf(c)>=0) return '森林';
    if(p==='条纹') return '薄荷';
    return any();
  }
  if(styleName==='森系居家'){
    if(green.indexOf(c)>=0) return '雨后';
    if(f==='棉麻/亚麻') return '茶香';
    if(warmTone.indexOf(c)>=0) return '暖木';
    return any();
  }
  if(styleName==='晚礼服/名媛'){
    if(red.indexOf(c)>=0) return '玫瑰';
    if(light.indexOf(c)>=0) return '香槟';
    if(dark.indexOf(c)>=0) return '东方';
    return any();
  }
  return any();
}

// ============================================================
//  💌 香语文案：香料→英文气质词(A) / 意象→香料(B)
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
const IMAGE_B={
  'rain':'仙客来','Ocean mist':'海水','Morning haze':'青草','caramel':'香草','desert rain':'岩兰草',
  'fog':'焚香','Salt breeze':'海水','honey':'蜜桃','iron':'藏红花','ice':'薄荷','Quiet library dust':'香根草',
  'sugar':'棉花糖','Rain on dry earth':'广藿香','wind':'雪松','stone':'零陵香豆',
  'Sun-warmed bark':'橡木','Candle glow':'琥珀','Ash from incense':'檀木','Dew on glass':'小苍兰','moss':'橡木苔','bark':'雪松',
  'brine':'海水','cream':'栀子花','peat':'广藿香','flint':'粉红胡椒','cocoa':'零陵香豆',
  'Green flecks in golden dough':'小豆蔻','tar':'烟草木','Cloud drift':'白麝香',
  'Forest shadow':'橡木苔','Velvet dusk':'檀木','Honeycomb drip':'蜜桃'
};
// 材质 → 意象(B)
const MATERIAL_B={'皮革':'iron','牛仔':'stone','针织/毛衣':'Ash from incense','棉':'Cloud drift','丝绸/缎面':'Dew on glass','棉麻/亚麻':'Morning haze','科技/运动面料':'wind','毛绒':'Cloud drift'};

// ============================================================
//  适用情景规则（生成文案时按条件过滤模板）
// ============================================================
const SOFT_FABRIC=['棉','丝绸/缎面','棉麻/亚麻','针织/毛衣','毛绒'];              // 可「亲手触摸」
const SCENT_FABRIC=['棉','丝绸/缎面','棉麻/亚麻','针织/毛衣','毛绒','皮革'];      // 可「留香」
const DISTINCT_PRINT=['豹纹/动物纹','扎染','碎花','格纹'];                        // 可用「用这个印花的人不多」
const ALL_PRINT=['豹纹/动物纹','扎染','碎花','格纹','条纹','波点'];               // 有花纹
const PRINT_IMG={'碎花':'Morning haze','波点':'Dew on glass','格纹':'Quiet library dust','条纹':'Ocean mist','扎染':'Cloud drift','豹纹/动物纹':'Forest shadow'};
// 颜色 → 允许的香料系（颜色句必须香料同调性；藏红花偏红归红色系）
// 香料 → 可配颜色（色调匹配，range放宽；颜色句从「配方里匹配当前颜色的香料」中选，保证色调对得上）
const SPICE_COLOR={
  // ── 野性 / 皮革 / 焚香 ──
  '皮革':['黑色','深灰','灰色','深棕','棕色','卡其','藏青','深蓝','牛仔蓝'],
  '烟草木':['黑色','深灰','深棕','棕色','酒红'],
  '藏红花':['黑色','深灰','酒红','红色','玫红','棕色'],
  '焚香':['黑色','深灰','酒红','红色','深紫'],
  '乳香':['黑色','深灰','灰色','棕色','卡其'],
  '琥珀':['黑色','深灰','深棕','棕色','驼色','卡其','米色','橙色','黄色','酒红'],
  '广藿香':['黑色','深灰','深棕','棕色','墨绿','军绿','橄榄绿','暗橄榄绿'],
  '黑醋栗芽':['黑色','深灰','酒红','深紫','紫色'],
  '粉红胡椒':['黑色','深灰','酒红','玫红','粉色','橙色','卡其'],
  '小豆蔻':['棕色','卡其','米色','橙色','黄色','墨绿','橄榄绿'],
  // ── 办公 / 木质 / 茶 ──
  '雪松':['黑色','深灰','灰色','浅灰','棕色','藏青','深蓝'],
  '香根草':['黑色','深灰','灰色','浅灰','卡其','棕色','深棕'],
  '橡木':['深棕','棕色','驼色','卡其','墨绿','橄榄绿','军绿'],
  '橡木苔':['墨绿','橄榄绿','军绿','暗橄榄绿','深灰','灰色'],
  '苔藓':['墨绿','橄榄绿','军绿','绿色','暗橄榄绿'],
  '香葵子':['墨绿','橄榄绿','军绿','深灰'],
  '檀木':['黑色','深棕','棕色','卡其','米色','藏青','深蓝','深紫'],
  '白木':['白色','浅灰','灰色','米色','米黄','浅粉','淡紫'],
  '龙涎香醚':['白色','浅灰','灰色','米色','浅蓝','天蓝','淡紫','浅粉'],
  '乌龙':['黑色','深灰','棕色','深棕','酒红','藏青','深蓝','深紫'],
  '白茶':['白色','浅灰','灰色','米色','米黄','浅粉','淡紫'],
  '佛手柑':['橙色','黄色','米黄','米色','浅绿','绿色'],
  '绿叶':['绿色','浅绿','墨绿','橄榄绿','军绿','卡其'],
  '天竺葵':['粉色','玫红','浅粉','红色'],
  '柑橘':['橙色','黄色','米黄','米色','浅绿','绿色'],
  // ── 甜美 / 花香 ──
  '樱花':['粉色','浅粉','白色','浅灰','玫红'],
  '橙花':['白色','浅粉','米色','米黄','浅灰','粉色'],
  '蜜桃':['粉色','浅粉','玫红','米色','米黄','橙色'],
  '栀子花':['白色','浅粉','米色','米黄','粉色','浅灰'],
  '棉花糖':['白色','浅粉','粉色','浅灰','米色'],
  '香草':['米色','米黄','棕色','卡其','橙色','粉色','浅粉'],
  '紫罗兰':['深紫','紫色','淡紫','酒红','玫红'],
  '鸢尾脂':['淡紫','紫色','浅粉','米色','米黄','白色','浅灰'],
  '鸢尾根':['深紫','紫色','淡紫','藏青','深蓝','浅灰','灰色'],
  '依兰':['粉色','浅粉','淡紫','米色'],
  '郁金香':['粉色','玫红','红色','橙色','黄色','绿色'],
  '铃兰':['白色','浅灰','浅绿','天蓝','浅蓝','淡紫'],
  '小苍兰':['白色','浅灰','天蓝','浅蓝','淡紫','浅绿'],
  '仙客来':['粉色','浅粉','淡紫','白色','浅灰'],
  '木兰':['白色','浅粉','米色','米黄','浅灰'],
  '玫瑰净油':['玫红','红色','酒红','深紫','粉色'],
  '青草':['绿色','浅绿','墨绿','橄榄绿','军绿','卡其'],
  '无花果叶':['墨绿','橄榄绿','军绿','绿色','浅绿'],
  '竹叶':['绿色','浅绿','墨绿','橄榄绿'],
  '小黄瓜':['浅绿','绿色','浅蓝','天蓝','白色'],
  // ── 运动 / 海洋 / 薄荷 ──
  '海水':['蓝色','天蓝','浅蓝','藏青','深蓝','牛仔蓝','白色'],
  '海洋':['蓝色','天蓝','浅蓝','藏青','深蓝','牛仔蓝'],
  '薄荷':['浅绿','绿色','天蓝','浅蓝','白色','浅灰'],
  '野莓':['玫红','红色','酒红','深紫','紫色'],
  '甜橙':['橙色','黄色','米黄','米色'],
  '葡萄柚':['橙色','黄色','米黄','浅绿','绿色','浅蓝'],
  '岩兰草':['棕色','卡其','橄榄绿','军绿','牛仔蓝','蓝色'],
  '松针':['墨绿','橄榄绿','军绿','绿色','深蓝','藏青'],
  '肉豆蔻':['棕色','深棕','卡其','米色','酒红','橙色'],
  // ── 名媛 / 甜香 ──
  '香槟气泡':['白色','浅灰','米色','米黄','浅蓝','天蓝','淡紫'],
  '麝香酮':['黑色','深灰','深棕','藏青','深蓝','深紫'],
  '零陵香豆':['棕色','卡其','米色','深棕','酒红','橙色'],
  '白麝香':['白色','浅灰','灰色','米色','米黄','浅粉','淡紫']
};
// 颜色 → 意象（颜色句用，贴合颜色调性）
const COLOR_IMG={
  '黑色':'Ash from incense','深灰':'Ash from incense','灰色':'Morning haze','浅灰':'Morning haze','白色':'Cloud drift','浅粉':'Cloud drift',
  '红色':'Candle glow','酒红':'Candle glow','玫红':'Candle glow','粉色':'Honeycomb drip',
  '橙色':'Candle glow','黄色':'Candle glow','米黄':'caramel',
  '深棕':'Sun-warmed bark','棕色':'Sun-warmed bark','驼色':'Sun-warmed bark','卡其':'Sun-warmed bark','米色':'Sun-warmed bark',
  '绿色':'Morning haze','浅绿':'Morning haze','墨绿':'Forest shadow','橄榄绿':'Forest shadow','暗橄榄绿':'Forest shadow','军绿':'Forest shadow',
  '蓝色':'Ocean mist','天蓝':'Ocean mist','浅蓝':'Ocean mist','藏青':'Ocean mist','深蓝':'Ocean mist','牛仔蓝':'Ocean mist',
  '紫色':'Velvet dusk','深紫':'Velvet dusk','淡紫':'Velvet dusk'
};
// 香料 → 意象（香味句用：意象必须跟香料同调，不能小豆蔻配风）
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

// 意象(B)的中文对照
const IMAGE_B_CN={'rain':'雨','Ocean mist':'海雾','Morning haze':'晨雾','caramel':'焦糖','desert rain':'沙漠雨','fog':'雾','Salt breeze':'咸海风','honey':'蜜','iron':'铁','ice':'冰','Quiet library dust':'书卷尘','sugar':'糖','Rain on dry earth':'旱地雨','wind':'风','stone':'石','Sun-warmed bark':'暖阳树皮','Candle glow':'烛光','Ash from incense':'香灰','Dew on glass':'窗上露','moss':'苔','bark':'树皮','brine':'盐水','cream':'奶油','peat':'泥炭','flint':'燧石','cocoa':'可可','Green flecks in golden dough':'金面团里的绿点','tar':'沥青','Cloud drift':'流云','Forest shadow':'林间暗影','Velvet dusk':'天鹅绒暮色','Honeycomb drip':'蜜巢滴落','jam':'果酱','Pine resin':'松脂','desert rock':'沙地岩石','Scarlet Velvet':'猩红天鹅绒'};

// ============================================================
//  💌 句式素材池（按类型分组，生成时随机抽选）
//  占位符：{col}颜色 {g}款式 {f}材质 {p}印花
//          {enSp}英文香料 {imgB}意象英文 {imgCN}意象中文
// ============================================================
const TEMPLATES={
  opening:['哦，来客人了。','我要为你调出最好的香水。','你来了？我正好在调香。'],
  garment:[
    '你今天穿了条{col}{g}呀。',
    '这件{g}很衬你。',
    '献给一位穿着美丽{g}的人。',
    '你试过“{enSp}”吗？you really should try。',
    '{col}{g}，简单又耐看。',
    '这件{g}给我一种{imgCN}的感觉。'
  ],
  material:[
    '很喜欢{f}材质上的“{enSp}”香气。',
    '亲手触摸{f}材质。'
  ],
  color:[
    '{col}宛如“{enSp}”。',
    '{col}是美妙的，{imgCN}的颜色。',
    'Such a dreamy {col}{g}，我要为之添加“{enSp}”。',
    '{col}总让我想起{imgCN}。'
  ],
  printBold:['豹纹是大胆的。你的品味不错。'],
  printOther:['{imgCN}一般的{p}…添加一些“{enSp}”。','用这个{p}的人不多，你很有性格。'],
  scent:['需要一点{imgCN}，用“{enSp}”正好。','这种时候，适合一点{enSp}。','加一点{enSp}，感觉就对了。'],
  ending1:['这是我的作品，hope you like it。','好了，慢慢享受。'],
  ending2:['给你准备了两个多余的香，你可以选择少量添加它们。']
};
const pick=arr=>arr[Math.floor(Math.random()*arr.length)];
const fill=(tpl,o)=>tpl.replace(/\{(col|g|enSp|imgCN|imgB|f|p)\}/g,(_,k)=>o[k]||'');
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
  const colW=cn=>cn.endsWith('色')?cn:cn+'色';
  const base={col:colors.length?colW(colors[0]):'',imgB:'wind',imgCN:'风',g:'',f:'',p:'',enSp:''};
  const res=[]; // 每句 {t:文本, s:香料}
  const add=(t,s)=>res.push({t,s});
  const scentOf=(spice)=>{
    const img=SPICE_IMG[spice]||'wind';
    return fill(pickNR(TEMPLATES.scent),Object.assign({},base,{imgB:img,imgCN:IMAGE_B_CN[img]||img,enSp:SPICE_EN[spice]||spice}));
  };
  const slotLine=(slot)=>{
    const t=slot.type, lab=slot.label||'';
    if(t==='color'){
      const cw=colW(lab);
      const cImg=COLOR_IMG[lab]||'wind';
      // 颜色句必出：香料必须匹配当前颜色（SPICE_COLOR 色调表）
      const cSp=colorMatch(lab);
      const o=Object.assign({},base,{col:cw,imgB:cImg,imgCN:IMAGE_B_CN[cImg]||cImg,enSp:SPICE_EN[cSp]||cSp});
      return {t:fill(pickNR(TEMPLATES.color),o), s:cSp};
    }
    if(t==='print'){
      if(lab==='豹纹/动物纹') return {t:fill(pick(TEMPLATES.printBold),Object.assign({},base,{p:lab})), s:''};
      if(ALL_PRINT.indexOf(lab)>=0){
        const pImg=PRINT_IMG[lab]||'wind';
        const pSp=take([IMAGE_B[pImg]].filter(s=>all.indexOf(s)>=0));
        const pPool=TEMPLATES.printOther.filter(tp=>{ if(tp.indexOf('用这个')>=0)return DISTINCT_PRINT.indexOf(lab)>=0; return true; });
        return {t:fill(pickNR(pPool),Object.assign({},base,{p:lab,imgB:pImg,imgCN:IMAGE_B_CN[pImg]||pImg,enSp:SPICE_EN[pSp]||pSp})), s:pSp};
      }
      const sSp=take([]); // 纯色 → 香味句（意象跟香料走）
      return {t:scentOf(sSp), s:sSp};
    }
    if(t==='fabric'){
      const f=lab;
      const mSp=take([IMAGE_B[MATERIAL_B[f]||'wind']].filter(s=>all.indexOf(s)>=0));
      const mPool=TEMPLATES.material.filter(tp=>(tp.indexOf('亲手触摸')>=0&&SOFT_FABRIC.indexOf(f)>=0)||(tp.indexOf('材质上的')>=0&&SCENT_FABRIC.indexOf(f)>=0));
      if(!mPool.length) return null;
      return {t:fill(pickNR(mPool),Object.assign({},base,{f,enSp:SPICE_EN[mSp]||mSp})), s:mSp};
    }
    if(t==='garment'){
      const g=lab;
      const gPool=base.col?['你今天穿了条{col}{g}呀。','{col}{g}，简单又耐看。','这件{g}给我一种{imgCN}的感觉。','这件{g}很衬你。','献给一位穿着美丽{g}的人。','你试过“{enSp}”吗？you really should try。']
        :['这件{g}很衬你。','献给一位穿着美丽{g}的人。','你试过“{enSp}”吗？you really should try。'];
      const tpl=pickNR(gPool);
      // 款式句若带颜色（{col}），香料也要匹配该颜色
      const gSp=tpl.indexOf('{col}')>=0?colorMatch(base.col):take([]);
      const gImg=SPICE_IMG[gSp]||base.imgB;
      const gImgCN=IMAGE_B_CN[gImg]||base.imgCN;
      return {t:fill(tpl,Object.assign({},base,{g,imgB:gImg,imgCN:gImgCN,enSp:SPICE_EN[gSp]||gSp})), s:gSp};
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
  // 5 句中段最后一句固定为「我最后会加一点{香料}」
  const lastSp=take([]);
  add('我最后会加一点'+(SPICE_EN[lastSp]||lastSp)+'。', lastSp);
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
  if(g.pattern && g.pattern!=='纯色') slots.push({type:'print', label:g.pattern, score:2.2});
  return slots;
}
// g.style = {top,mid,base} 六风格香料池; g.colors = 中文色名数组; 返回 8 行 [{t,s}]
function makeCopy(g){
  const a={style:g.style||{}, colors:g.colors||[], slots:attrSlotsFor(g)};
  return genCopy(a);
}
window.COPY={RECIPES,STYLE_DEFS,pickVariant,makeCopy};
