const http = require('http');
const https = require('https');
const dataStore = require('./data-store');

// 敏感词与不良命名过滤黑名单
const BLACKLIST_KEYWORDS = [
    '操', '死', '逼', '傻', '混蛋', '白痴', '王八', '滚', '狗贼', '垃圾',
    '杀', '砍', '血', '残', '毒', '鬼', '魔', '坟', '尸', '暴',
    '弱智', '废物', '恶心', '变态', '下流', '作弊', '老师笨', '学校烂'
];

class AiReviewService {
    /**
     * 审核学生提交的装扮
     * @param {Object} outfitData 装扮数据 (name, components)
     * @param {Object} authorData 作者数据 (id, displayName)
     * @returns {Promise<{pass: boolean, reason: string, aiType: string, score: number}>}
     */
    async reviewOutfit(outfitData = {}, authorData = {}) {
        const config = dataStore.getConfig();
        const aiConfig = config.aiReview || config.aiConfig || {};

        // 如果配置了 LLM 且有 API Key，尝试调用大模型；否则使用本地离线规则引擎
        if (aiConfig.mode === 'llm' && aiConfig.llmApiKey && aiConfig.llmEndpoint) {
            try {
                const llmResult = await this.reviewWithLLM(outfitData, aiConfig);
                return {
                    pass: llmResult.pass,
                    reason: llmResult.reason,
                    aiType: 'llm',
                    score: llmResult.score || 95
                };
            } catch (err) {
                console.warn('[AI Review] LLM 调用失败，降级为本地规则引擎:', err.message);
            }
        }

        // 本地离线规则引擎预审
        return this.reviewWithLocalRules(outfitData);
    }

    /**
     * 本地离线规则引擎（无需网络，毫秒级响应）
     */
    reviewWithLocalRules(outfitData) {
        const name = (outfitData.name || '').trim();

        // 1. 标题长度检测
        if (!name || name.length < 2) {
            return {
                pass: false,
                reason: '装扮名称太短，请起一个响亮的名字（至少2个字）',
                aiType: 'rule_engine',
                score: 30
            };
        }
        if (name.length > 15) {
            return {
                pass: false,
                reason: '装扮名称过长，请控制在15个字以内',
                aiType: 'rule_engine',
                score: 40
            };
        }

        // 2. 敏感词违规过滤
        for (const kw of BLACKLIST_KEYWORDS) {
            if (name.includes(kw)) {
                return {
                    pass: false,
                    reason: `装扮名称含有不文明或不合规词汇「${kw}」`,
                    aiType: 'rule_engine',
                    score: 0
                };
            }
        }

        // 3. 配件合理性检测
        const accessories = (outfitData && outfitData.components && Array.isArray(outfitData.components.accessories))
            ? outfitData.components.accessories
            : [];
        if (accessories.length > 5) {
            return {
                pass: false,
                reason: '佩戴饰品数量超出上限（最多5件饰品）',
                aiType: 'rule_engine',
                score: 50
            };
        }

        // 4. 合规通过，进入待教师最终确认阶段
        return {
            pass: true,
            reason: 'AI预审合规：名称积极健康，搭配符合班级展示规范',
            aiType: 'rule_engine',
            score: 95
        };
    }

    /**
     * 外部大语言模型接口调用（可选）
     */
    reviewWithLLM(outfitData, aiConfig) {
        return new Promise((resolve, reject) => {
            const payload = JSON.stringify({
                model: aiConfig.llmModel || 'gpt-3.5-turbo',
                messages: [
                    {
                        role: 'system',
                        content: '你是一个初中班级宠物大屏的内容安全审核员。请判断学生提交的宠物装扮名称及搭配是否符合中小学积极向上的文化氛围。返回JSON格式: {"pass": true/false, "reason": "理由", "score": 0-100}'
                    },
                    {
                        role: 'user',
                        content: `装扮名称: "${outfitData.name}", 配件清单: ${JSON.stringify(outfitData.components?.accessories || [])}`
                    }
                ],
                temperature: 0.2
            });

            try {
                const url = new URL(aiConfig.llmEndpoint);
                const isHttps = url.protocol === 'https:';
                const client = isHttps ? https : http;

                const options = {
                    hostname: url.hostname,
                    port: url.port || (isHttps ? 443 : 80),
                    path: url.pathname + (url.search || ''),
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${aiConfig.llmApiKey}`,
                        'Content-Length': Buffer.byteLength(payload)
                    },
                    timeout: 5000
                };

                const req = client.request(options, (res) => {
                    let data = '';
                    res.on('data', chunk => { data += chunk; });
                    res.on('end', () => {
                        try {
                            const parsed = JSON.parse(data);
                            const content = parsed.choices?.[0]?.message?.content;
                            const jsonMatch = content.match(/\{[\s\S]*\}/);
                            if (jsonMatch) {
                                resolve(JSON.parse(jsonMatch[0]));
                            } else {
                                resolve({ pass: true, reason: 'LLM审核通过', score: 90 });
                            }
                        } catch (e) {
                            reject(e);
                        }
                    });
                });

                req.on('error', reject);
                req.on('timeout', () => {
                    req.destroy();
                    reject(new Error('LLM request timeout'));
                });

                req.write(payload);
                req.end();
            } catch (err) {
                reject(err);
            }
        });
    }
}

module.exports = new AiReviewService();
