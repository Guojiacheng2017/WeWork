const surnames = '王 李 张 刘 陈 杨 黄 赵 吴 周 徐 孙 马 朱 胡 郭 何 林 罗 高 郑 梁 谢 宋 唐 许 韩 冯 邓 曹 彭 曾 萧 田 董 袁 潘 于 蒋 蔡 余 杜 叶 程 苏 魏 吕 丁 任 沈 姚 卢 姜 崔 钟 谭 陆 汪 范 金 石 廖 贾 夏 韦 傅 方 白 邹 孟 熊 秦 邱 江 尹 薛 阎 段 雷 侯 龙 史 陶 黎 贺 顾 毛 郝 龚 邵 万 钱 严 覃 武 戴 莫 孔 向 汤 常 温 康 施 文 牛 樊 葛 邢 安 齐 易 乔 伍 庞 颜 倪 庄 聂 章 鲁 岳 翟 殷 詹 申 欧 耿 关 兰 焦 俞 左 柳 甘 祝 包 宁 尚 符 舒 阮 柯 纪 梅 童 凌 毕 单 季 成 洪 华 喻 欧阳 上官 司马 诸葛'.split(' ');
const givenNames = '知远 予安 明澈 若宁 思齐 景行 以宁 书言 清和 嘉言 望舒 星澜 云舒 亦辰 可欣 子衿 浩然 子涵 一诺 宇轩 雨桐 诗涵 欣怡 梓萱 沐阳 晨曦 嘉宁 文博 思源 致远 博文 俊逸 明轩 安然 若溪 语桐 佳宁 雨晴 书瑶 清扬 星辰 逸凡 泽宇 宇航 嘉禾 亦安 子墨 景明 皓月 予宁 乐言 思远 明远 知夏 以晴 向晚 亦然 启明 书航 景云 容与 怀瑾 言蹊 予希 念初 安宁 清越 嘉树 云帆 宇恒 俊熙 泽楷 文昊 天佑 宇晨 睿哲 承泽 逸晨 柏言 书恒 知行 沐辰 星宇 景尧 明朗 乐知 语宁 依然 以安 舒言 诗雨 静宜 雅宁 晓岚 佳音 雨薇 思敏 文静 若琳 婉清 芷晴 若曦 心怡 晓彤 雅琪 可心 沐瑶 语馨 芷宁 悦然 诗宁 佳禾 梦瑶 思彤 晓晴 文清 安琪 静雅 欣然 亦可 子悦 若瑜 昕然 书妍 佳辰 瑞安 嘉诚 修远 承安 云开 朝阳 启航 远舟 立言 弘毅 维安 景川 明哲 行简 鹤鸣 允和 松言 之恒 思衡 知新 守一 怀远 清源 云舟 星野 亦舟'.split(' ');
const englishNames = 'Alex Morgan Taylor Jamie Casey Robin Sam Jordan Riley Avery Emma Oliver Noah Mia Leo Sophie Clara Ethan Lucas Chloe Nora Owen Elena Felix Alice Amelia Anna Audrey Ava Bella Benjamin Blake Cameron Charlie Charlotte Chris Claire Daniel David Dylan Edward Eleanor Eli Ella Emily Eric Eva Evelyn Finn Florence Gabriel Grace Hannah Harper Hazel Henry Hugo Iris Isaac Isla Ivy Jack Jacob James Jane Jasper Jesse Joseph Joshua Julia Julian June Kai Kate Katherine Leah Liam Lily Logan Lucy Luke Luna Maya Max Michael Miles Nathan Natalie Nicholas Nina Olivia Oscar Paige Parker Patrick Peter Quinn Rachel Rebecca Reese Rose Rowan Ruby Ryan Sadie Sarah Sebastian Simon Skyler Sophia Stella Theo Thomas Toby Tristan Tyler Victoria Violet Vivian William Zoe Adrian Aiden Anthony Aria Arthur Austin Beatrice Caleb Cecilia Connor Daisy Elliot Emilia Fiona George Harvey Josephine Luca Marcus Matilda Naomi Phoebe Samuel Serena Vincent Wesley Willow Zachary'.split(' ');
/** Generate an editable display name, avoiding names already used in the team. */
export function randomEmployeeName(existing: string[] = []): string {
  const used = new Set(existing.map(name => name.trim().toLowerCase()));
  const pools = [surnames.flatMap(surname => givenNames.map(given => surname + given)), englishNames]
    .map(names => names.filter(name => !used.has(name.toLowerCase())))
    .filter(names => names.length);
  const available = pools.length ? pools[Math.floor(Math.random() * pools.length)] : [];
  if (available.length) return available[Math.floor(Math.random() * available.length)];
  let suffix = 2;
  while (used.has(`林知远${suffix}`)) suffix++;
  return `林知远${suffix}`;
}
