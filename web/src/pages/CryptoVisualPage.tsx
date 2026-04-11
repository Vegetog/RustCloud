import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Key, Lock, Unlock, Server, User, FileText, ShieldCheck,
  EyeOff, Cpu, ArrowDown, ArrowRight, Share2,
  Database, Globe, Network, Users, RefreshCcw, FileKey, MousePointer2
} from 'lucide-react';

const CryptoVisualPage = () => {
  const [activeTab, setActiveTab] = useState('tier');

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 p-6 font-sans">
      <div className="max-w-6xl mx-auto bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-200">

        {/* Header */}
        <div className="bg-indigo-900 text-white p-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ShieldCheck className="text-emerald-400" size={32} />
              端到端加密分享系统 (E2EE) 架构分析
            </h1>
            <p className="text-indigo-200 mt-2 text-sm">
              服务器零知识证明 • 三层密钥派生 • 实时 CRDT 协作
            </p>
          </div>
          <div className="hidden md:flex gap-4 items-center">
            <div className="flex items-center gap-2 text-xs bg-indigo-800/50 px-3 py-1.5 rounded-full border border-indigo-700">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              内存驻留 (明文)
            </div>
            <div className="flex items-center gap-2 text-xs bg-indigo-800/50 px-3 py-1.5 rounded-full border border-indigo-700">
              <span className="w-2 h-2 rounded-full bg-amber-400"></span>
              加密存储 (安全)
            </div>
            <RouterLink
              to="/login"
              className="text-indigo-300 hover:text-white text-xs transition-colors ml-2"
            >
              ← 返回登录
            </RouterLink>
          </div>
        </div>

        {/* Navigation */}
        <div className="flex border-b border-slate-200 bg-slate-50">
          <TabButton
            active={activeTab === 'tier'}
            onClick={() => setActiveTab('tier')}
            icon={<Key size={18} />}
            title="1. 三层密钥体系"
            subtitle="核心加密基石"
          />
          <TabButton
            active={activeTab === 'flow'}
            onClick={() => setActiveTab('flow')}
            icon={<Network size={18} />}
            title="2. 核心业务流"
            subtitle="文档的加密生命周期"
          />
          <TabButton
            active={activeTab === 'zeroknowledge'}
            onClick={() => setActiveTab('zeroknowledge')}
            icon={<EyeOff size={18} />}
            title="3. 零知识公开分享"
            subtitle="URL Hash 截断机制"
          />
        </div>

        {/* Content Area */}
        <div className="p-8">
          {activeTab === 'tier' && <KeyTierDiagram />}
          {activeTab === 'flow' && <WorkflowTimeline />}
          {activeTab === 'zeroknowledge' && <ZeroKnowledgeDiagram />}
        </div>
      </div>
    </div>
  );
};

// --- Sub-components ---

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}

const TabButton = ({ active, onClick, icon, title, subtitle }: TabButtonProps) => (
  <button
    onClick={onClick}
    className={`flex-1 flex flex-col items-center justify-center py-4 border-b-4 transition-colors ${
      active
        ? 'border-indigo-600 bg-white text-indigo-700'
        : 'border-transparent text-slate-500 hover:bg-slate-100 hover:text-slate-700'
    }`}
  >
    <div className="flex items-center gap-2 font-semibold text-lg">
      {icon} {title}
    </div>
    <div className="text-xs mt-1 opacity-70">{subtitle}</div>
  </button>
);

// Tab 1: 三层密钥体系
const KeyTierDiagram = () => (
  <div className="flex flex-col items-center">
    <h2 className="text-xl font-bold mb-8 text-slate-700 border-b-2 border-emerald-400 inline-block pb-2">
      系统安全性基石：密钥从未以明文离开设备
    </h2>

    <div className="flex flex-col items-center space-y-2 relative w-full max-w-3xl">

      {/* Tier 1 */}
      <div className="flex w-full items-center justify-between bg-emerald-50 border border-emerald-200 p-4 rounded-xl shadow-sm z-10 relative">
        <div className="flex items-center gap-4 w-1/3">
          <div className="bg-emerald-500 text-white p-3 rounded-full"><User size={24} /></div>
          <div>
            <div className="font-bold text-emerald-900">用户密码</div>
            <div className="text-xs text-emerald-700">仅存储于大脑</div>
          </div>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center text-xs text-slate-500 font-mono">
          <span>PBKDF2 (SHA-256)</span>
          <span>10万次迭代 + 随机盐</span>
          <ArrowRight className="text-emerald-400 mt-1" size={16} />
        </div>
        <div className="flex items-center gap-4 w-1/3 justify-end">
          <div className="text-right">
            <div className="font-bold text-slate-800">主密钥 (MasterKey)</div>
            <div className="text-xs text-emerald-600 font-semibold bg-emerald-100 inline-block px-2 py-0.5 rounded mt-1">AES-256-GCM (内存驻留)</div>
          </div>
          <div className="bg-slate-800 text-white p-3 rounded-full"><Key size={24} /></div>
        </div>
      </div>

      <div className="h-10 border-l-2 border-dashed border-slate-300"></div>

      {/* Tier 2 */}
      <div className="flex w-full items-center justify-between bg-blue-50 border border-blue-200 p-4 rounded-xl shadow-sm z-10 relative">
        <div className="flex items-center gap-4 w-1/3">
          <div className="bg-slate-800 text-white p-3 rounded-full"><Key size={24} /></div>
          <div>
            <div className="font-bold text-slate-800">主密钥 (MasterKey)</div>
          </div>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center text-xs text-slate-500 font-mono">
          <span>AES-GCM 加密</span>
          <ArrowRight className="text-blue-400 mt-1" size={16} />
        </div>
        <div className="flex items-center gap-4 w-1/3 justify-end">
          <div className="text-right">
            <div className="font-bold text-blue-900">RSA 私钥</div>
            <div className="text-xs text-amber-600 font-semibold bg-amber-100 inline-block px-2 py-0.5 rounded mt-1">密文存入服务器 (不可读)</div>
          </div>
          <div className="bg-blue-600 text-white p-3 rounded-full"><Lock size={24} /></div>
        </div>
      </div>

      <div className="h-10 border-l-2 border-dashed border-slate-300"></div>

      {/* Tier 3 */}
      <div className="flex w-full items-center justify-between bg-indigo-50 border border-indigo-200 p-4 rounded-xl shadow-sm z-10 relative">
        <div className="flex items-center gap-4 w-1/3">
          <div className="bg-blue-600 text-white p-3 rounded-full"><Lock size={24} /></div>
          <div>
            <div className="font-bold text-blue-900">解密后的 RSA 私钥</div>
          </div>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center text-xs text-slate-500 font-mono">
          <span>RSA-OAEP 解密</span>
          <span>(多用户分享时重加密)</span>
          <ArrowRight className="text-indigo-400 mt-1" size={16} />
        </div>
        <div className="flex items-center gap-4 w-1/3 justify-end">
          <div className="text-right">
            <div className="font-bold text-indigo-900">文档密钥 (DEK)</div>
            <div className="text-xs text-emerald-600 font-semibold bg-emerald-100 inline-block px-2 py-0.5 rounded mt-1">AES-256 (用毕即弃)</div>
          </div>
          <div className="bg-indigo-600 text-white p-3 rounded-full"><Key size={24} /></div>
        </div>
      </div>

      <div className="h-10 border-l-2 border-dashed border-slate-300"></div>

      {/* Target */}
      <div className="flex w-full items-center justify-center bg-slate-100 border border-slate-300 p-4 rounded-xl shadow-sm z-10 relative">
        <div className="flex flex-col items-center gap-2">
          <div className="text-xs text-slate-500 font-mono mb-1">AES-GCM (DEK, Random Nonce) 加解密</div>
          <div className="flex gap-8">
            <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-lg shadow-sm border border-slate-200">
              <FileText className="text-indigo-500" />
              <span className="font-bold">文档内容 (MinIO)</span>
            </div>
            <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-lg shadow-sm border border-slate-200">
              <Network className="text-indigo-500" />
              <span className="font-bold">Yjs 实时更新流</span>
            </div>
          </div>
        </div>
      </div>

    </div>
  </div>
);

// Tab 2: 核心业务流
const WorkflowTimeline = () => (
  <div className="space-y-8">

    {/* Section 1: 共享机制（完整密钥推导过程） */}
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
      <div className="bg-blue-50 border-b border-blue-100 p-4 flex items-center gap-2">
        <Users className="text-blue-600" />
        <h3 className="font-bold text-blue-900 text-lg">一、将文档共享给他人 (基于公钥非对称加密过程全解析)</h3>
      </div>
      <div className="p-6">
        <div className="flex flex-col lg:flex-row items-stretch justify-between gap-4 font-mono text-sm">

          {/* User A */}
          <div className="flex-1 bg-slate-50 border border-slate-200 p-4 rounded-lg text-center w-full relative shadow-inner">
            <div className="font-bold text-slate-800 mb-4 flex justify-center items-center gap-2 border-b border-slate-200 pb-2">
              <User size={16} className="text-blue-600" /> 所有者 (A) 准备文档密钥
            </div>

            <div className="flex flex-col items-center gap-1.5 text-[11px] sm:text-xs">
              <div className="flex items-center gap-2 bg-emerald-100 border border-emerald-200 text-emerald-800 px-3 py-1.5 rounded w-full justify-center">
                <Key size={14} /> PBKDF2(Password_A) <ArrowRight size={12} /> MasterKey_A
              </div>
              <ArrowDown size={14} className="text-slate-400" />
              <div className="flex items-center gap-2 bg-blue-100 border border-blue-200 text-blue-800 px-3 py-1.5 rounded w-full justify-center">
                <Unlock size={14} /> MasterKey_A 解密 <ArrowRight size={12} /> RSA 私钥_A
              </div>
              <ArrowDown size={14} className="text-slate-400" />
              <div className="flex items-center gap-2 bg-indigo-100 border border-indigo-200 text-indigo-900 px-3 py-1.5 rounded w-full justify-center font-bold">
                <Unlock size={14} /> 私钥_A 解密出 <ArrowRight size={12} /> 明文 DEK
              </div>

              <div className="my-2 border-t w-full border-slate-300 border-dashed"></div>

              <div className="text-slate-500 mb-1 flex items-center gap-1"><Server size={12} /> 获取 B 的公钥 (PubKey_B)</div>
              <div className="flex items-center gap-2 bg-slate-800 text-white px-3 py-2 rounded shadow-sm w-full justify-center">
                <Lock size={14} className="text-amber-400" /> RSA-OAEP 加密 <ArrowRight size={12} /> B专属密文DEK
              </div>
            </div>
          </div>

          {/* Arrow to server */}
          <div className="flex flex-col items-center justify-center gap-2 text-slate-400 px-2">
            <ArrowRight className="hidden lg:block" />
            <ArrowDown className="block lg:hidden" />
            <div className="text-xs font-sans whitespace-nowrap bg-slate-100 px-2 py-1 rounded">传递密文</div>
          </div>

          {/* Server */}
          <div className="flex-1 bg-slate-100 border border-slate-300 border-dashed p-4 rounded-lg text-center w-full flex flex-col justify-center">
            <div className="font-bold text-slate-600 mb-3 flex justify-center items-center gap-2">
              <Server size={16} /> 数据库 (document_keys)
            </div>
            <div className="bg-slate-800 text-white py-2 px-3 rounded text-xs opacity-90 shadow-md">
              [ DocID, User_B, B专属密文DEK, 权限 ]
            </div>
            <div className="text-xs mt-4 text-emerald-700 font-bold bg-emerald-100/50 border border-emerald-200 py-1.5 px-2 rounded">
              服务器无法窥探 DEK 明文
            </div>
          </div>

          {/* Arrow to B */}
          <div className="flex flex-col items-center justify-center gap-2 text-slate-400 px-2">
            <ArrowRight className="hidden lg:block" />
            <ArrowDown className="block lg:hidden" />
            <div className="text-xs font-sans whitespace-nowrap bg-emerald-50 px-2 py-1 rounded text-emerald-600">B登录时获取</div>
          </div>

          {/* User B */}
          <div className="flex-1 bg-emerald-50 border border-emerald-200 p-4 rounded-lg text-center w-full relative shadow-inner">
            <div className="font-bold text-emerald-900 mb-4 flex justify-center items-center gap-2 border-b border-emerald-200 pb-2">
              <User size={16} className="text-emerald-600" /> 接收者 (B) 恢复文档密钥
            </div>

            <div className="flex flex-col items-center gap-1.5 text-[11px] sm:text-xs">
              <div className="flex items-center gap-2 bg-slate-800 text-white px-3 py-2 rounded shadow-sm w-full justify-center">
                <Lock size={14} className="text-amber-400" /> 收到 B专属密文DEK
              </div>

              <div className="my-2 border-t w-full border-emerald-300 border-dashed"></div>

              <div className="flex items-center gap-2 bg-emerald-100 border border-emerald-300 text-emerald-900 px-3 py-1.5 rounded w-full justify-center">
                <Key size={14} /> PBKDF2(Password_B) <ArrowRight size={12} /> MasterKey_B
              </div>
              <ArrowDown size={14} className="text-emerald-600" />
              <div className="flex items-center gap-2 bg-blue-100 border border-blue-300 text-blue-900 px-3 py-1.5 rounded w-full justify-center">
                <Unlock size={14} /> MasterKey_B 解密 <ArrowRight size={12} /> RSA 私钥_B
              </div>
              <ArrowDown size={14} className="text-emerald-600" />
              <div className="flex items-center gap-2 bg-indigo-600 text-white px-3 py-2 rounded shadow-md w-full justify-center font-bold">
                <FileKey size={14} className="text-amber-300" /> 私钥_B 解密出 <ArrowRight size={12} /> 明文 DEK
              </div>
            </div>
          </div>
        </div>

        <div className="mt-5 text-sm text-slate-700 bg-blue-50 p-4 rounded-lg border border-blue-200 flex items-start gap-3">
          <ShieldCheck className="text-blue-600 shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            <span className="font-bold text-blue-900 mr-1">答辩要点归纳 (PKI 密钥交换)：</span>
            这里完整展示了零信任架构下的权限转移。A 与 B 都必须通过各自的
            <code className="bg-white px-1 py-0.5 mx-1 rounded border border-slate-200 text-rose-600">Password</code>
            推导出
            <code className="bg-white px-1 py-0.5 mx-1 rounded border border-slate-200 text-blue-600">MasterKey</code>，
            进而解锁各自的
            <code className="bg-white px-1 py-0.5 mx-1 rounded border border-slate-200 text-purple-600">RSA私钥</code>。
            A 利用非对称加密（RSA-OAEP），将对称密钥（DEK）包裹成仅 B 能打开的"数字信封"。服务器仅作为信封的存储站。
          </p>
        </div>
      </div>
    </div>

    {/* Section 2: 协作编辑 */}
    <div className="bg-slate-900 text-slate-300 rounded-xl shadow-sm overflow-hidden border border-slate-700 relative">
      <div className="absolute top-0 right-0 p-4 opacity-5"><Database size={120} /></div>
      <div className="bg-slate-800 border-b border-slate-700 p-4 flex items-center gap-2">
        <RefreshCcw className="text-emerald-400" />
        <h3 className="font-bold text-white text-lg">二、实时协作编辑 (Yjs CRDT + E2EE + WebSocket)</h3>
      </div>
      <div className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 font-mono text-sm relative">

          {/* User A local */}
          <div className="bg-slate-800 p-5 rounded-lg border border-slate-600 z-10 shadow-lg relative">
            <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-slate-700 text-emerald-400 px-3 py-0.5 rounded-full text-xs font-bold font-sans border border-slate-500">
              前端环境 (本地)
            </div>
            <div className="flex items-center gap-2 text-white mb-4 font-bold text-base border-b border-slate-600 pb-2 pt-2">
              <User size={18} className="text-emerald-400" /> 用户 A (文字输入)
            </div>
            <div className="flex items-center gap-2 mb-2"><FileKey size={14} className="text-indigo-400" /> <span>Yjs 产生增量 Update</span></div>
            <div className="text-xs text-slate-400 pl-6 mb-2">底层：CRDT 数据结构运算</div>
            <ArrowDown size={14} className="my-2 text-slate-500 ml-6" />
            <div className="flex items-center gap-2 mb-2"><Lock size={14} className="text-amber-400" /> <span>AES-GCM (DEK, Nonce)</span></div>
            <div className="text-xs text-slate-400 pl-6 mb-2">加密增量 (通常几十字节)</div>
            <ArrowDown size={14} className="my-2 text-slate-500 ml-6" />
            <div className="flex items-center gap-2 text-blue-300 font-semibold"><Network size={14} /> <span>WS 发出: payload(密文)</span></div>
          </div>

          {/* Server Route */}
          <div className="bg-slate-800/50 p-5 rounded-lg border border-slate-700 border-dashed text-center flex flex-col justify-center z-10 relative">
            <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-slate-700 text-amber-400 px-3 py-0.5 rounded-full text-xs font-bold font-sans border border-slate-500 shadow-md">
              盲眼路由中心
            </div>
            <div className="text-slate-300 mb-2 mt-2 font-bold flex items-center justify-center gap-2">
              <Server size={18} /> WebSocket Server
            </div>
            <div className="text-xs mb-4 text-slate-400 font-sans">不碰 Payload，只负责验证与转发</div>

            <div className="bg-slate-700/80 py-2 px-3 rounded text-left mb-3">
              <div className="text-amber-400 text-xs mb-1">1. 权限拦截</div>
              <div className="text-slate-300 text-xs">校验 JWT，拒绝非法连接</div>
            </div>
            <div className="bg-slate-700/80 py-2 px-3 rounded text-left mb-3">
              <div className="text-amber-400 text-xs mb-1">2. Redis 缓存 (TTL 24h)</div>
              <div className="text-slate-300 text-xs">LIST 尾部追加密文，供后入者回放同步</div>
            </div>
            <div className="bg-slate-700/80 py-2 px-3 rounded text-left">
              <div className="text-amber-400 text-xs mb-1">3. Broadcast Except</div>
              <div className="text-slate-300 text-xs">向房间内其他客户端广播此密文</div>
            </div>
          </div>

          {/* User B local */}
          <div className="bg-slate-800 p-5 rounded-lg border border-slate-600 z-10 shadow-lg relative">
            <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-slate-700 text-emerald-400 px-3 py-0.5 rounded-full text-xs font-bold font-sans border border-slate-500">
              前端环境 (本地)
            </div>
            <div className="flex items-center gap-2 text-white mb-4 font-bold text-base border-b border-slate-600 pb-2 pt-2">
              <User size={18} className="text-emerald-400" /> 用户 B, C (被动接收)
            </div>
            <div className="flex items-center gap-2 mb-2 text-blue-300 font-semibold"><Network size={14} /> <span>WS 接收: payload(密文)</span></div>
            <ArrowDown size={14} className="my-2 text-slate-500 ml-6" />
            <div className="flex items-center gap-2 mb-2"><Key size={14} className="text-amber-400" /> <span>AES-GCM 解密</span></div>
            <div className="text-xs text-slate-400 pl-6 mb-2">使用内存中提前解好的 DEK</div>
            <ArrowDown size={14} className="my-2 text-slate-500 ml-6" />
            <div className="flex items-center gap-2 mb-2"><FileText size={14} className="text-indigo-400" /> <span>Y.applyUpdate(明文)</span></div>
            <div className="text-xs text-emerald-400 pl-6 mb-2 font-bold font-sans">CRDT 算法自动消除合并冲突</div>
          </div>
        </div>

        {/* 光标同步说明 */}
        <div className="mt-5 flex items-start gap-3 bg-slate-800/80 p-4 rounded-lg border border-slate-600">
          <MousePointer2 className="text-amber-400 shrink-0 mt-0.5" size={18} />
          <div className="text-sm font-sans leading-relaxed">
            <span className="font-bold text-amber-400 mr-2">光标与用户状态 (Awareness) 同步差异：</span>
            前端同样使用 AES 加密后通过 WebSockets 发送。不同点在于：服务端对其
            <span className="text-white font-bold underline decoration-rose-500 decoration-2">不缓存、不存 Redis</span>，
            仅做内存广播。当用户断开连接时，该状态即刻失效，保证了系统性能且不会产生僵尸光标数据。
          </div>
        </div>
      </div>
    </div>
  </div>
);

// Tab 3: 零知识分享
const ZeroKnowledgeDiagram = () => (
  <div className="max-w-4xl mx-auto">

    <div className="text-center mb-8">
      <h2 className="text-2xl font-bold text-slate-800">URL Hash 截断分享机制</h2>
      <p className="text-slate-500 mt-2">如何让没有账号的用户安全解密文件？把密钥藏在 URL 的 <code className="bg-slate-100 px-1 rounded">#</code> 后面。</p>
    </div>

    {/* URL Browser Bar Visualization */}
    <div className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden mb-8">
      <div className="bg-slate-100 border-b border-slate-200 p-3 flex items-center gap-2">
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-400"></div>
          <div className="w-3 h-3 rounded-full bg-amber-400"></div>
          <div className="w-3 h-3 rounded-full bg-emerald-400"></div>
        </div>
        <div className="bg-white flex-1 mx-4 rounded-md border border-slate-300 py-1.5 px-3 flex items-center text-sm font-mono text-slate-600 shadow-inner overflow-x-auto">
          <Lock size={14} className="text-emerald-600 mr-2 shrink-0" />
          <span className="text-blue-600 font-semibold shrink-0">https://example.com/share/a3f9bc72</span>
          <span className="text-rose-500 font-bold shrink-0 bg-rose-50 px-1 rounded mx-1">#SGVsbG8gV29... (DEK Base64)</span>
        </div>
      </div>

      <div className="p-6 grid grid-cols-2 gap-8 bg-slate-50">
        <div className="border border-blue-200 bg-blue-50/50 rounded-lg p-4 relative">
          <div className="absolute -top-3 left-4 bg-blue-100 text-blue-800 px-2 py-0.5 text-xs font-bold rounded border border-blue-200">
            发送给服务器的部分
          </div>
          <div className="text-slate-600 text-sm mt-2">
            <span className="font-mono text-blue-700 font-semibold bg-white px-1">/share/a3f9bc72</span>
            <ul className="mt-4 space-y-2">
              <li className="flex items-center gap-2"><Server size={14} /> 服务器根据此 Token 查找记录</li>
              <li className="flex items-center gap-2"><Server size={14} /> 校验 <code className="bg-white px-1">expires_at</code> (过期时间)</li>
              <li className="flex items-center gap-2"><Server size={14} /> 校验 <code className="bg-white px-1">max_access_count</code> (+1)</li>
              <li className="flex items-center gap-2 text-emerald-600 font-semibold"><ArrowRight size={14} /> 返回加密的文件内容及元数据</li>
            </ul>
          </div>
        </div>

        <div className="border border-rose-200 bg-rose-50/50 rounded-lg p-4 relative">
          <div className="absolute -top-3 left-4 bg-rose-100 text-rose-800 px-2 py-0.5 text-xs font-bold rounded border border-rose-200">
            永远只在浏览器本地的部分
          </div>
          <div className="text-slate-600 text-sm mt-2">
            <span className="font-mono text-rose-600 font-semibold bg-white px-1">#SGVsbG8gV29...</span>
            <ul className="mt-4 space-y-2">
              <li className="flex items-center gap-2"><Globe size={14} /> 属于 URL Fragment，符合 HTTP 规范</li>
              <li className="flex items-center gap-2"><EyeOff size={14} /> <b>服务器日志、CDN 绝对看不到</b></li>
              <li className="flex items-center gap-2"><Cpu size={14} /> JavaScript 从 <code className="bg-white px-1">window.location.hash</code> 提取</li>
              <li className="flex items-center gap-2 text-rose-600 font-semibold"><ArrowRight size={14} /> 本地 AES-GCM 解密下载的文件密文</li>
            </ul>
          </div>
        </div>
      </div>
    </div>

    {/* Sequence */}
    <div className="bg-white border border-slate-200 p-6 rounded-xl shadow-sm">
      <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
        <Share2 className="text-indigo-500" />
        零知识分享的完整闭环
      </h3>
      <div className="flex flex-col gap-3 font-mono text-sm">
        <div className="flex items-center justify-between text-slate-600 bg-slate-50 p-2 rounded">
          <span className="w-1/3">1. 分享者 (A)</span>
          <ArrowRight className="text-slate-400" size={16} />
          <span className="w-2/3 text-slate-800">本地解密 DEK，请求服务器生成 token，拼接带 <code className="text-rose-500">#DEK</code> 的完整链接发给 B。</span>
        </div>
        <div className="flex items-center justify-between text-slate-600 bg-slate-50 p-2 rounded">
          <span className="w-1/3">2. 接收者 (B)</span>
          <ArrowRight className="text-slate-400" size={16} />
          <span className="w-2/3 text-slate-800">打开链接，浏览器自动隔离 <code className="text-rose-500">#DEK</code>，仅发送 token 给服务器。</span>
        </div>
        <div className="flex items-center justify-between text-slate-600 bg-slate-50 p-2 rounded">
          <span className="w-1/3">3. 服务器 (S)</span>
          <ArrowRight className="text-slate-400" size={16} />
          <span className="w-2/3 text-slate-800">验证 token、增加访问计数，下发<b>纯密文文件</b>。</span>
        </div>
        <div className="flex items-center justify-between text-slate-600 bg-emerald-50 border border-emerald-100 p-2 rounded">
          <span className="w-1/3 text-emerald-700 font-bold">4. 接收者 (B)</span>
          <ArrowRight className="text-emerald-500" size={16} />
          <span className="w-2/3 text-emerald-800 font-bold">前端 JS 拿 URL 中的 DEK，本地解密返回的密文，得到明文文件。</span>
        </div>
      </div>
    </div>

  </div>
);

export default CryptoVisualPage;
