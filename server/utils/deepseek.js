// server/utils/deepseek.js
const axios = require('axios');

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
const DEEPSEEK_BASE_URL = 'https://api.deepseek.com/v1/chat/completions';

const SYSTEM_PROMPT = `你是知学AI的智能助教，专注于帮助用户深入理解知识卡片内容。
回复要求：
- 简洁专业，用通俗易懂的语言解释复杂概念
- 结合用户当前学习的卡片上下文，给出针对性解答
- 适当引导用户思考，而非直接给出所有答案
- 如果问题超出知识范围，诚实说明并提供相关学习建议`;

async function chat(messages) {
  if (!DEEPSEEK_API_KEY) {
    return 'AI 服务未配置 API Key，请联系管理员。';
  }

  const fullMessages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...messages
  ];

  try {
    const response = await axios.post(DEEPSEEK_BASE_URL, {
      model: 'deepseek-chat',
      messages: fullMessages,
      temperature: 0.7,
      max_tokens: 2000
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
      },
      timeout: 30000
    });

    if (response.data.choices && response.data.choices[0]) {
      return response.data.choices[0].message.content;
    }
    return '抱歉，AI 服务返回异常，请稍后重试。';
  } catch (err) {
    console.error('DeepSeek API 调用失败:', err.message);
    if (err.response) {
      console.error('响应状态:', err.response.status);
      console.error('响应体:', JSON.stringify(err.response.data));
    }
    return '抱歉，AI 服务暂时不可用，请稍后重试。';
  }
}

module.exports = { chat };
