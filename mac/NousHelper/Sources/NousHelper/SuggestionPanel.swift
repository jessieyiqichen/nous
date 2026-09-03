import AppKit
import SwiftUI

let RELATION_OPTIONS = ["上级", "不熟的同事", "刚认识", "同事", "客户", "普通朋友", "在意的人", "家人"]
/// 没有关系信息时传给服务端的标记，模型自己从内容推（与 web/lib/twin.ts UNKNOWN_RELATION 对齐）
let UNKNOWN_RELATION = "未知"

/// 解析「关系：内容」前缀；不带前缀 → 关系未知（快捷键路径拿不到发件人，交给模型猜）
func parseRelationPrefix(_ text: String) -> (relation: String, content: String) {
    for r in RELATION_OPTIONS + ["朋友", "亲戚", "陌生人", "老板", "领导"] {
        for sep in ["：", ":"] {
            let prefix = r + sep
            if text.hasPrefix(prefix), text.count > prefix.count {
                let content = String(text.dropFirst(prefix.count)).trimmingCharacters(in: .whitespaces)
                return (r, content)
            }
        }
    }
    return (UNKNOWN_RELATION, text)
}

// ── 面板状态 ─────────────────────────────────────────────────

final class PanelModel: ObservableObject {
    enum State {
        case loading
        case result(TwinAnalysis)
        case error(String)
    }

    @Published var state: State = .loading
    @Published var relation: String = UNKNOWN_RELATION
    /// 关系是模型猜的（非用户指定/记忆）——紧凑视图提示一句，方便一眼看出猜错
    @Published var relationGuessed: Bool = false
    @Published var content: String = ""
    /// 分析细节默认收起——日常使用只看草稿
    @Published var showDetails: Bool = false
    /// 送去分析的原始消息文本（content 可能带「发件人：」展示前缀）
    var rawContent: String = ""
    /// 通知来源时的发件人，用于关系映射记忆
    var sender: String? = nil

    var onFill: ((String) -> Void)?
    var onCopy: ((String) -> Void)?
    var onClose: (() -> Void)?
    var onReanalyze: ((String) -> Void)?
    var onLayoutChange: (() -> Void)?
}

// ── SwiftUI 视图 ─────────────────────────────────────────────

struct SuggestionView: View {
    @ObservedObject var model: PanelModel

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            // 头部（固定）
            HStack {
                Text("N").font(.system(size: 11, weight: .bold)).foregroundColor(.white)
                    .frame(width: 18, height: 18).background(Color(red: 0.55, green: 0.35, blue: 0.22)).cornerRadius(5)
                Text("NOUS 分身").font(.system(size: 10, weight: .medium)).foregroundColor(.secondary).kerning(1)
                if case .result(let a) = model.state {
                    Text(TRIAGE_LABELS[a.triage.action] ?? a.triage.action)
                        .font(.system(size: 9, weight: .semibold))
                        .padding(.horizontal, 6).padding(.vertical, 2)
                        .background(Color.accentColor.opacity(0.13))
                        .foregroundColor(.accentColor).cornerRadius(4)
                }
                Spacer()
                Button(action: { model.onClose?() }) {
                    Image(systemName: "xmark").font(.system(size: 10))
                }.buttonStyle(.plain).foregroundColor(.secondary)
            }

            // 中段（可滚动）
            ScrollView(.vertical, showsIndicators: true) {
                VStack(alignment: .leading, spacing: 10) {
                    switch model.state {
                    case .loading:
                        HStack(spacing: 8) {
                            ProgressView().controlSize(.small)
                            Text("分身正在判断...").font(.system(size: 12)).foregroundColor(.secondary)
                        }.padding(.vertical, 8)

                    case .error(let message):
                        Text(message).font(.system(size: 12)).foregroundColor(.red).padding(.vertical, 4)

                    case .result(let a):
                        if model.relationGuessed {
                            Text("按「\(model.relation)」回 · 不对就在详情里点改")
                                .font(.system(size: 10)).foregroundColor(.secondary)
                        }
                        // 主体：草稿（或无草稿时的一句话建议）
                        if let draft = a.draft {
                            Text(draft)
                                .font(.system(size: 12.5))
                                .padding(8)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .background(Color.primary.opacity(0.05))
                                .cornerRadius(8)
                                .textSelection(.enabled)
                        } else {
                            Text(a.triage.action == "personal" ? "这条建议你亲自回。" : "这条不用回。")
                                .font(.system(size: 13))
                        }

                        // 质检警告：只在详情里显示全文（紧凑视图只留草稿+按钮）
                        if model.showDetails, let gap = a.gap_note {
                            Label {
                                Text(gap).font(.system(size: 11)).foregroundColor(.secondary)
                            } icon: {
                                Text("⚠︎").font(.system(size: 11)).foregroundColor(.orange)
                            }
                        }

                        // 分析细节：默认全部收起
                        if model.showDetails {
                            Divider()
                            Text(model.content).font(.system(size: 11)).foregroundColor(.secondary)
                            HStack(spacing: 4) {
                                ForEach(RELATION_OPTIONS, id: \.self) { r in
                                    Button(action: { model.onReanalyze?(r) }) {
                                        Text(r).font(.system(size: 10))
                                            .padding(.horizontal, 7).padding(.vertical, 3)
                                            .background(model.relation == r ? Color.accentColor.opacity(0.18) : Color.clear)
                                            .foregroundColor(model.relation == r ? .accentColor : .secondary)
                                            .cornerRadius(9)
                                    }.buttonStyle(.plain)
                                }
                            }
                            Text(a.triage.reason).font(.system(size: 11)).foregroundColor(.secondary)
                            ForEach(a.grounding.indices, id: \.self) { i in
                                let g = a.grounding[i]
                                HStack(alignment: .top, spacing: 6) {
                                    Text(DIM_NAMES_ZH[g.dimension] ?? g.dimension)
                                        .font(.system(size: 9)).foregroundColor(.accentColor)
                                        .padding(.horizontal, 5).padding(.vertical, 2)
                                        .overlay(RoundedRectangle(cornerRadius: 3).stroke(Color.secondary.opacity(0.3), lineWidth: 0.5))
                                    Text(g.note).font(.system(size: 10.5)).foregroundColor(.secondary)
                                }
                            }
                        }
                    }
                }
                .padding(.bottom, 2)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)

            // 底部（固定）：动作按钮 + 详情开关
            if case .result(let a) = model.state {
                HStack(spacing: 8) {
                    if let draft = a.draft {
                        Button("填入输入框") { model.onFill?(draft) }
                            .buttonStyle(.borderedProminent).controlSize(.small)
                        Button("仅复制") { model.onCopy?(draft) }
                            .buttonStyle(.bordered).controlSize(.small)
                    } else {
                        Button("知道了") { model.onClose?() }
                            .buttonStyle(.bordered).controlSize(.small)
                    }
                    Spacer()
                    Button(model.showDetails ? "收起" : "详情") {
                        model.showDetails.toggle()
                        model.onLayoutChange?()
                    }
                    .buttonStyle(.plain).font(.system(size: 10)).foregroundColor(.secondary)
                }
            }
        }
        .padding(8)
        .frame(width: 260)
        .frame(maxHeight: .infinity, alignment: .top)
    }
}

// ── 非激活悬浮面板（点击不抢走微信的焦点）────────────────────────

final class PanelController {
    let model = PanelModel()
    private var panel: NSPanel?

    private static let width: CGFloat = 260

    func show() {
        if panel == nil {
            let p = NSPanel(
                contentRect: NSRect(x: 0, y: 0, width: Self.width, height: 60),
                styleMask: [.nonactivatingPanel, .titled, .closable, .fullSizeContentView],
                backing: .buffered,
                defer: false
            )
            p.titleVisibility = .hidden
            p.titlebarAppearsTransparent = true
            p.level = .floating
            p.becomesKeyOnlyIfNeeded = true
            p.hidesOnDeactivate = false
            p.isReleasedWhenClosed = false
            p.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
            p.contentView = NSHostingView(rootView: SuggestionView(model: model))
            panel = p
        }
        applySize()
        panel?.orderFrontRegardless()
    }

    /// 状态/详情开关变化后调用：极简结果态矮窗，展开详情才变高
    func applySize() {
        guard let panel = panel, let screen = NSScreen.main else { return }
        let vf = screen.visibleFrame
        let height: CGFloat
        switch model.state {
        case .loading:
            height = 60
        case .error:
            height = 120
        case .result:
            height = model.showDetails ? min(400, vf.height - 80) : 180
        }
        panel.setContentSize(NSSize(width: Self.width, height: height))
        // 锚定右上角
        panel.setFrameOrigin(NSPoint(x: vf.maxX - Self.width - 24, y: vf.maxY - height - 24))
    }

    func hide() {
        panel?.orderOut(nil)
    }
}
