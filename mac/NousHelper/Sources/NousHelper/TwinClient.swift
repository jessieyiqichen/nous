import Foundation

// ── /api/twin 数据模型（与 web/lib/twin.ts 对齐）────────────────

struct TwinGrounding: Codable {
    let dimension: String
    let note: String
}

struct TwinTriage: Codable {
    let action: String // ignore | defer | draft | personal
    let reason: String
}

struct TwinAnalysis: Codable {
    let triage: TwinTriage
    let draft: String?
    let grounding: [TwinGrounding]
    let gap_note: String?
    /// 关系传「未知」时服务端的推断；旧服务端没有此字段 → nil
    let relation_guess: String?
}

private struct TwinResponse: Codable { let analysis: TwinAnalysis }
private struct TwinError: Codable { let error: String? }

let DIM_NAMES_ZH: [String: String] = [
    "Decision Architecture": "决策架构",
    "Attention Allocation": "注意力分配",
    "Reasoning Style": "推理风格",
    "Emotional Processing": "情绪处理",
    "Social Cognition": "社会认知",
    "Blind Spots": "盲区",
    "Value Hierarchy": "价值层级",
    "Response to Uncertainty": "不确定性应对",
    "Execution-Layer Flexibility": "执行层弹性",
]

let TRIAGE_LABELS: [String: String] = [
    "draft": "分身代回",
    "defer": "缓回",
    "personal": "建议亲自回",
    "ignore": "不回",
]

// ── API 客户端 ───────────────────────────────────────────────

enum TwinResult {
    case success(TwinAnalysis)
    case failure(String)
}

enum TwinClient {
    /// 直连分身服务，绕开系统代理/VPN：服务器在国内，直连最快；
    /// 系统代理（Clash 等）对「裸 IP:端口」的 HTTPS 经常挂起，这是助手"没反应"的头号原因。
    static let session: URLSession = {
        let config = URLSessionConfiguration.ephemeral
        // 显式关闭三类代理（空字典在新版 macOS 上不一定生效）
        config.connectionProxyDictionary = [
            kCFNetworkProxiesHTTPEnable as String: 0,
            kCFNetworkProxiesHTTPSEnable as String: 0,
            kCFNetworkProxiesSOCKSEnable as String: 0,
        ]
        config.timeoutIntervalForRequest = 45
        config.waitsForConnectivity = false
        return URLSession(configuration: config)
    }()

    static var baseURL: String {
        UserDefaults.standard.string(forKey: "serverBaseURL") ?? "http://localhost:3999"
    }

    static func setBaseURL(_ url: String) {
        UserDefaults.standard.set(url, forKey: "serverBaseURL")
    }

    /// 用户身份（飞书 open_id 等）。配了就用该用户在服务端的模型与修正池；不配用静态模型。
    static var userId: String? {
        let v = UserDefaults.standard.string(forKey: "twinUserId")
        return (v?.isEmpty == false) ? v : nil
    }

    /// 调分身分析。回调在主线程。
    static func analyze(
        relation: String,
        content: String,
        completion: @escaping (TwinResult) -> Void
    ) {
        guard let url = URL(string: "\(baseURL)/api/twin") else {
            DispatchQueue.main.async { completion(.failure("服务器地址无效：\(baseURL)")) }
            return
        }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.timeoutInterval = 45
        var payload: [String: Any] = ["relation": relation, "content": content]
        if let uid = userId { payload["userId"] = uid }
        req.httpBody = try? JSONSerialization.data(withJSONObject: payload)

        session.dataTask(with: req) { data, response, error in
            let result: TwinResult
            if let error = error {
                let ns = error as NSError
                NSLog("NousHelper: 请求失败 domain=%@ code=%ld %@", ns.domain, ns.code, ns.localizedDescription)
                result = .failure("无法连接分身服务（\(ns.code)：\(ns.localizedDescription)）")
            } else if let data = data {
                if let ok = try? JSONDecoder().decode(TwinResponse.self, from: data) {
                    result = .success(ok.analysis)
                } else if let err = try? JSONDecoder().decode(TwinError.self, from: data), let msg = err.error {
                    result = .failure(msg)
                } else {
                    result = .failure("分身服务返回了无法解析的内容。")
                }
            } else {
                result = .failure("分身服务无响应。")
            }
            DispatchQueue.main.async { completion(result) }
        }.resume()
    }

    /// 修正信号上报（fire-and-forget）：采纳/改写都是分身的学习数据
    static func report(relation: String, incoming: String, draft: String?, final: String?, action: String) {
        guard let url = URL(string: "\(baseURL)/api/twin/feedback") else { return }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.timeoutInterval = 15
        var body: [String: Any] = [
            "source": "mac-helper",
            "relation": relation,
            "incoming": incoming,
            "action": action,
        ]
        if let draft = draft { body["draft"] = draft }
        if let final = final { body["final"] = final }
        if let uid = userId { body["userId"] = uid }
        req.httpBody = try? JSONSerialization.data(withJSONObject: body)
        session.dataTask(with: req).resume()
    }
}
