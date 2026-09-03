// ── /agent 分身聊天：共享类型 + 脚本化会话数据 ──────────────────
// 预设线程离线预存（基于真实 9 维模型手工整理），面试现场不依赖 API。
// 组长/阿凯各有第二轮追问——多轮代理能力是聊天形态独有的展示点。

export type TriageAction = "ignore" | "defer" | "draft" | "personal";

export interface TwinGrounding {
  dimension: string;
  note: string;
}

export interface TwinAnalysis {
  triage: { action: TriageAction; reason: string };
  draft: string | null;
  grounding: TwinGrounding[];
  gap_note: string | null;
}

export interface ScriptedTurn {
  incoming: string;
  analysis: TwinAnalysis;
}

export interface ThreadDef {
  id: string;
  sender: string;
  relation: string;
  /** 会话所在的真实平台——分身横跨所有聊天软件，这里只是模拟舞台 */
  channel: string;
  /** 通知中心里显示的相对时间（静态文案，演示用） */
  notifTime: string;
  turns: ScriptedTurn[];
  /** 你最后一条回复发出后，对方的收尾消息（分身判定无需再回） */
  closing?: string;
}

export const TRIAGE_META: Record<TriageAction, { label: string; color: string }> = {
  draft: { label: "分身代回", color: "var(--accent)" },
  personal: { label: "建议亲自回", color: "var(--success)" },
  defer: { label: "缓回", color: "var(--warning)" },
  ignore: { label: "不回", color: "var(--muted-soft)" },
};

export const DIM_NAMES_ZH: Record<string, string> = {
  "Decision Architecture": "决策架构",
  "Attention Allocation": "注意力分配",
  "Reasoning Style": "推理风格",
  "Emotional Processing": "情绪处理",
  "Social Cognition": "社会认知",
  "Blind Spots": "盲区",
  "Value Hierarchy": "价值层级",
  "Response to Uncertainty": "不确定性应对",
  "Execution-Layer Flexibility": "执行层弹性",
};

export const RELATION_OPTIONS = ["同事", "普通朋友", "在意的人", "家人", "上级", "陌生人"];

// ── 宿主 App 视觉主题（演示用，模拟分身寄生的真实聊天软件）──────
export interface ChannelTheme {
  appColor: string; // 通知中心里的 App 图标色
  headerBg: string;
  headerColor: string;
  headerSubColor: string;
  chatBg: string;
  myBubbleBg: string;
  myBubbleColor: string;
  theirBubbleBg: string;
  theirBubbleColor: string;
  noteColor: string;
}

export const CHANNEL_THEMES: Record<string, ChannelTheme> = {
  微信: {
    appColor: "#07c160",
    headerBg: "#ededed", headerColor: "#111111", headerSubColor: "#888888",
    chatBg: "#ededed",
    myBubbleBg: "#95ec69", myBubbleColor: "#111111",
    theirBubbleBg: "#ffffff", theirBubbleColor: "#111111",
    noteColor: "#aaaaaa",
  },
  钉钉: {
    appColor: "#2e7bff",
    headerBg: "#2e7bff", headerColor: "#ffffff", headerSubColor: "rgba(255,255,255,0.78)",
    chatBg: "#eef1f6",
    myBubbleBg: "#cfe1ff", myBubbleColor: "#16233d",
    theirBubbleBg: "#ffffff", theirBubbleColor: "#1f2329",
    noteColor: "#9aa5b5",
  },
  飞书: {
    appColor: "#3370ff",
    headerBg: "#ffffff", headerColor: "#1f2329", headerSubColor: "#8f959e",
    chatBg: "#f5f6f7",
    myBubbleBg: "#3370ff", myBubbleColor: "#ffffff",
    theirBubbleBg: "#ffffff", theirBubbleColor: "#1f2329",
    noteColor: "#a6adb8",
  },
};

export const DEFAULT_CHANNEL_THEME = CHANNEL_THEMES["微信"];

export const THREADS: ThreadDef[] = [
  {
    id: "boss",
    notifTime: "刚刚",
    channel: "钉钉",
    sender: "组长",
    relation: "上级 · 非在乎任务",
    closing: "行，那就这样，辛苦。",
    turns: [
      {
        incoming: "这周末有空吗？帮忙把部门季度汇报的数据整理一下，下周一要用",
        analysis: {
          triage: {
            action: "draft",
            reason: "拒绝成本高，这个忙会帮。但这是你执行层的高危区——先看质检，再决定承诺多少。",
          },
          draft: "可以，不过我周末已有安排，只能周日晚上处理——我先把数据表和核心图表整理出来，格式美化看组里谁有空补一下？",
          grounding: [
            { dimension: "Execution-Layer Flexibility", note: "非在乎任务实际执行是最低可行标准，承诺前先把范围对齐到这个量" },
            { dimension: "Blind Spots", note: "系统性低估生理成本，默认方案又是牺牲周日睡眠" },
          ],
          gap_note:
            "你的第一反应是回「好的没问题」——但行为记录显示，这类任务你会拖到周日深夜、用最低标准完成，还搭上睡眠。草稿已把承诺压缩到你实际会做的量。",
        },
      },
      {
        incoming: "行，辛苦了。不过最好周六就能给我，周日我想自己先过一遍",
        analysis: {
          triage: {
            action: "draft",
            reason: "他在往回压时间——承诺被逐步扩大的经典时刻。守住周日晚，给他一个可核查的中间物代替提前交付。",
          },
          draft: "周六真排不开。这样：周日晚十点前我把整理好的数据表和核心图表发你，结构先按上季度的来，你周一早上过一遍完全来得及。",
          grounding: [
            { dimension: "Execution-Layer Flexibility", note: "边界一旦让步，下次的默认起点就是周六" },
            { dimension: "Social Cognition", note: "不硬顶，用「可核查的交付物 + 时间点」替代空承诺" },
          ],
          gap_note:
            "你此刻的冲动是「算了答应吧，别来回拉扯」——妥协省下的是这一轮的社交成本，透支的是以后每一轮的边界。",
        },
      },
    ],
  },
  {
    id: "friend",
    notifTime: "2分钟前",
    channel: "微信",
    sender: "小林",
    relation: "在意的人",
    turns: [
      {
        incoming: "睡了吗？最近好像有点撑不住了，想找你聊聊",
        analysis: {
          triage: {
            action: "personal",
            reason: "高在乎域，分身不代打。这条你会亲自接，而且会全力接住——即使你自己也很累。",
          },
          draft: null,
          grounding: [
            { dimension: "Attention Allocation", note: "在意的人 = 高投入区，疲惫状态也会接" },
            { dimension: "Emotional Processing", note: "你会先帮对方把问题结构理出来，而不只是安慰" },
          ],
          gap_note:
            "你说自己「对人的情绪不够敏感」——但对在意的人，你实际的接住能力远高于你的自我评估。",
        },
      },
    ],
  },
  {
    id: "party",
    notifTime: "10分钟前",
    channel: "微信",
    sender: "阿凯",
    relation: "普通朋友",
    closing: "哈哈一言为定！那我们周五先玩",
    turns: [
      {
        incoming: "周五那个局你真不来了？大家都问你呢，就差你了😂",
        analysis: {
          triage: {
            action: "draft",
            reason: "第三次邀请也不构成去的理由——你不受「拒绝太多次不好意思」的人情惯性影响。但关系要保温，拒绝要给具体替代承诺。",
          },
          draft: "真去不了，这周五得把手头的东西赶完。你们玩，下次你单独攒局我肯定到。",
          grounding: [
            { dimension: "Attention Allocation", note: "不感兴趣的聚会 = 近零投入，不会勉强参加" },
            { dimension: "Blind Spots", note: "缺社会默认基线，不被「就差你了」的惯性绑架" },
            { dimension: "Social Cognition", note: "给具体替代承诺，拒绝但不冷场" },
          ],
          gap_note: null,
        },
      },
      {
        incoming: "行吧行吧。对了你最近在忙啥呢，神神秘秘的",
        analysis: {
          triage: {
            action: "draft",
            reason: "关系保温的低成本机会。真诚但收敛——这不是你想深聊的对象，给答案不开话题。",
          },
          draft: "在弄一个 AI 的小项目，做成了请你吃饭。你们周五玩开心点！",
          grounding: [
            { dimension: "Social Cognition", note: "表达深度自动校准：真诚、简短、把话题轻轻合上" },
            { dimension: "Attention Allocation", note: "不展开 = 不为低在乎话题开新的注意力支出" },
          ],
          gap_note: null,
        },
      },
    ],
  },
  {
    id: "colleague",
    notifTime: "23分钟前",
    channel: "飞书",
    sender: "同事小周",
    relation: "工作 · 低在乎域",
    closing: "收到！太感谢了🙏",
    turns: [
      {
        incoming: "在吗？之前你做的那个数据看板方案能发我参考下吗？我们组也想做一个类似的",
        analysis: {
          triage: {
            action: "draft",
            reason: "近零投入区，但举手之劳、不回的社交成本更高。最低成本一次性解决，末尾把话收死，不开启后续对话。",
          },
          draft: "发你了，在共享文档里。整体照着第二节的结构改就行，有具体卡住的地方再喊我。",
          grounding: [
            { dimension: "Attention Allocation", note: "低在乎域给最低可行投入，一次回复关闭线程" },
            { dimension: "Social Cognition", note: "措辞留了热度，帮到位但不显得可以无限追问" },
          ],
          gap_note: null,
        },
      },
    ],
  },
  {
    id: "aunt",
    notifTime: "1小时前",
    channel: "微信",
    sender: "二姨",
    relation: "亲戚 · 寒暄",
    closing: "好好好，忙你的去吧",
    turns: [
      {
        incoming: "在忙吗？最近工作怎么样呀，有空常回来看看",
        analysis: {
          triage: {
            action: "defer",
            reason: "无信息量寒暄，不用即时回——攒到晚上统一低成本处理，不占用当前注意力。草稿已备好。",
          },
          draft: "最近挺好的二姨！在忙一个项目，等忙完这阵回去看你们～",
          grounding: [
            { dimension: "Attention Allocation", note: "寒暄类延迟批处理，保护当前注意力块" },
            { dimension: "Social Cognition", note: "回复热度校准到「亲戚寒暄」该有的量" },
          ],
          gap_note: null,
        },
      },
    ],
  },
  {
    id: "vote",
    notifTime: "2小时前",
    channel: "微信",
    sender: "老同学（群发）",
    relation: "弱关系 · 群发",
    turns: [
      {
        incoming: "麻烦帮忙给我家娃投个票！编号23，每天都能投哦，谢谢🙏",
        analysis: {
          triage: {
            action: "ignore",
            reason: "群发拉票，近零投入区且无真实关系成本。你的模式是直接不回，也不会有心理负担。",
          },
          draft: null,
          grounding: [
            { dimension: "Attention Allocation", note: "群发消息在你的注意力体系里权重为零" },
            { dimension: "Blind Spots", note: "不受「别人都帮忙投了」的从众压力" },
          ],
          gap_note: null,
        },
      },
    ],
  },
];
