// 加密体系可视化演示页面：用于毕业答辩展示
// 通过交互式步骤演示完整的加密流程

import { useState, useCallback } from 'react';
import {
  Cloud,
  Key,
  Lock,
  Unlock,
  Shield,
  ShieldCheck,
  ArrowDown,
  ArrowRight,
  Play,
  RotateCcw,
  CheckCircle,
  Loader2,
  FileText,
  Eye,
  EyeOff,
  Share2,
  KeyRound,
  Hash,
  Binary,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { cryptoService } from '../services/crypto';

// 可视化步骤的状态类型
interface StepState {
  status: 'idle' | 'running' | 'done';
  data: Record<string, string>;
  duration?: number;
}

// 将 ArrayBuffer 截取前 N 字节转为十六进制显示
function bufferToHexPreview(buffer: ArrayBuffer, maxBytes = 32): string {
  const bytes = new Uint8Array(buffer);
  const slice = bytes.slice(0, maxBytes);
  const hex = Array.from(slice)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join(' ');
  return bytes.length > maxBytes ? hex + ' ...' : hex;
}

// 数据显示标签组件
function DataTag({
  label,
  value,
  color = 'blue',
  mono = true,
}: {
  label: string;
  value: string;
  color?: 'blue' | 'green' | 'amber' | 'red' | 'purple' | 'indigo';
  mono?: boolean;
}) {
  const colorMap = {
    blue: 'bg-blue-50 border-blue-200 text-blue-800',
    green: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    amber: 'bg-amber-50 border-amber-200 text-amber-800',
    red: 'bg-red-50 border-red-200 text-red-800',
    purple: 'bg-purple-50 border-purple-200 text-purple-800',
    indigo: 'bg-indigo-50 border-indigo-200 text-indigo-800',
  };

  return (
    <div className={`border rounded-lg p-3 ${colorMap[color]} animate-in fade-in`}>
      <div className="text-xs font-semibold mb-1 opacity-70">{label}</div>
      <div
        className={`text-xs break-all ${mono ? 'font-mono' : ''} leading-relaxed max-h-20 overflow-y-auto`}
      >
        {value}
      </div>
    </div>
  );
}

// 流程箭头组件
function FlowArrow({ direction = 'down', label }: { direction?: 'down' | 'right'; label?: string }) {
  return (
    <div className={`flex ${direction === 'down' ? 'flex-col' : ''} items-center justify-center py-2`}>
      {direction === 'down' ? (
        <ArrowDown className="w-5 h-5 text-slate-400" />
      ) : (
        <ArrowRight className="w-5 h-5 text-slate-400" />
      )}
      {label && <span className="text-[10px] text-slate-400 mt-0.5">{label}</span>}
    </div>
  );
}

// 步骤卡片容器
function StepCard({
  step,
  title,
  description,
  icon: Icon,
  status,
  children,
  onRun,
  disabled = false,
}: {
  step: number;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  status: 'idle' | 'running' | 'done';
  children?: React.ReactNode;
  onRun: () => void;
  disabled?: boolean;
}) {
  return (
    <div
      className={`border rounded-xl p-6 transition-all duration-300 ${
        status === 'done'
          ? 'border-emerald-300 bg-emerald-50/30 shadow-md shadow-emerald-100'
          : status === 'running'
            ? 'border-blue-300 bg-blue-50/30 shadow-md shadow-blue-100'
            : 'border-slate-200 bg-white hover:border-slate-300'
      }`}
    >
      {/* 标题栏 */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div
            className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold ${
              status === 'done'
                ? 'bg-emerald-500 text-white'
                : status === 'running'
                  ? 'bg-blue-500 text-white'
                  : 'bg-slate-100 text-slate-500'
            }`}
          >
            {status === 'done' ? <CheckCircle className="w-4 h-4" /> : step}
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <Icon className="w-4 h-4 text-slate-500" />
              <h3 className="font-semibold text-slate-800">{title}</h3>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">{description}</p>
          </div>
        </div>
        <button
          onClick={onRun}
          disabled={disabled || status === 'running'}
          className={`flex items-center space-x-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            status === 'running'
              ? 'bg-blue-100 text-blue-500 cursor-wait'
              : disabled
                ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                : status === 'done'
                  ? 'bg-emerald-100 text-emerald-600 hover:bg-emerald-200'
                  : 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm'
          }`}
        >
          {status === 'running' ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>执行中...</span>
            </>
          ) : status === 'done' ? (
            <>
              <RotateCcw className="w-3.5 h-3.5" />
              <span>重新执行</span>
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5" />
              <span>执行</span>
            </>
          )}
        </button>
      </div>

      {/* 结果内容 */}
      {children}
    </div>
  );
}

export function CryptoVisualPage() {
  // 各步骤的状态
  const [step1, setStep1] = useState<StepState>({ status: 'idle', data: {} });
  const [step2, setStep2] = useState<StepState>({ status: 'idle', data: {} });
  const [step3, setStep3] = useState<StepState>({ status: 'idle', data: {} });
  const [step4, setStep4] = useState<StepState>({ status: 'idle', data: {} });
  const [step5, setStep5] = useState<StepState>({ status: 'idle', data: {} });

  // 用户输入
  const [demoPassword, setDemoPassword] = useState('MySecureP@ssw0rd');
  const [demoPlaintext, setDemoPlaintext] = useState('这是一份机密文档的内容 - Hello RustCloud!');
  const [showPassword, setShowPassword] = useState(false);

  // 中间密钥存储（用于步骤间传递）
  const [masterKey, setMasterKey] = useState<CryptoKey | null>(null);
  const [keyPair, setKeyPair] = useState<{ publicKey: CryptoKey; privateKey: CryptoKey } | null>(null);
  const [encResult, setEncResult] = useState<{
    encryptedContent: ArrayBuffer;
    encryptedKey: string;
    contentNonce: string;
    encryptedName: string;
    nameNonce: string;
  } | null>(null);

  // 步骤 1：密码派生主密钥（PBKDF2）
  const runStep1 = useCallback(async () => {
    setStep1({ status: 'running', data: {} });
    const start = performance.now();

    const newSalt = crypto.getRandomValues(new Uint8Array(32));

    const key = await cryptoService.deriveMasterKey(demoPassword, newSalt);
    setMasterKey(key);

    const exportedKey = await crypto.subtle.exportKey('raw', key);
    const elapsed = Math.round(performance.now() - start);

    setStep1({
      status: 'done',
      duration: elapsed,
      data: {
        password: demoPassword,
        algorithm: 'PBKDF2',
        iterations: '100,000',
        hash: 'SHA-256',
        salt: bufferToHexPreview(newSalt.buffer, 16),
        saltLength: `${newSalt.length} 字节`,
        masterKey: bufferToHexPreview(exportedKey, 32),
        keyLength: '256 位 (32 字节)',
        keyUsage: 'AES-GCM 加密/解密',
      },
    });
  }, [demoPassword]);

  // 步骤 2：生成 RSA 密钥对
  const runStep2 = useCallback(async () => {
    setStep2({ status: 'running', data: {} });
    const start = performance.now();

    const kp = await cryptoService.generateKeyPair();
    setKeyPair(kp);

    const pubExported = await crypto.subtle.exportKey('spki', kp.publicKey);
    const privExported = await crypto.subtle.exportKey('pkcs8', kp.privateKey);
    const elapsed = Math.round(performance.now() - start);

    setStep2({
      status: 'done',
      duration: elapsed,
      data: {
        algorithm: 'RSA-OAEP',
        modulusLength: '2048 位',
        publicExponent: '65537 (0x010001)',
        hash: 'SHA-256',
        publicKeyFormat: 'SPKI (SubjectPublicKeyInfo)',
        publicKeySize: `${pubExported.byteLength} 字节`,
        publicKeyPreview: bufferToHexPreview(pubExported, 24),
        privateKeyFormat: 'PKCS8',
        privateKeySize: `${privExported.byteLength} 字节`,
        privateKeyPreview: bufferToHexPreview(privExported, 24),
      },
    });
  }, []);

  // 步骤 3：加密私钥（使用主密钥）
  const runStep3 = useCallback(async () => {
    if (!masterKey || !keyPair) return;
    setStep3({ status: 'running', data: {} });
    const start = performance.now();

    const encrypted = await cryptoService.encryptPrivateKey(keyPair.privateKey, masterKey);
    const elapsed = Math.round(performance.now() - start);

    setStep3({
      status: 'done',
      duration: elapsed,
      data: {
        algorithm: 'AES-256-GCM',
        inputFormat: 'PKCS8 私钥',
        nonce: bufferToHexPreview(encrypted.nonce.buffer as ArrayBuffer, 12),
        nonceLength: `${encrypted.nonce.length} 字节`,
        ciphertext: bufferToHexPreview(encrypted.ciphertext, 32),
        ciphertextSize: `${encrypted.ciphertext.byteLength} 字节`,
        storage: '加密私钥 + 盐值 → 发送到服务器存储',
        security: '服务器无法获取明文私钥',
      },
    });
  }, [masterKey, keyPair]);

  // 步骤 4：加密文档
  const runStep4 = useCallback(async () => {
    if (!keyPair) return;
    setStep4({ status: 'running', data: {} });
    const start = performance.now();

    const encoder = new TextEncoder();
    const content = encoder.encode(demoPlaintext);
    const fileName = '机密文档.txt';
    const file = new File([content], fileName, { type: 'text/plain' });

    const result = await cryptoService.encryptDocument(file, keyPair.publicKey);
    setEncResult(result);
    const elapsed = Math.round(performance.now() - start);

    setStep4({
      status: 'done',
      duration: elapsed,
      data: {
        originalContent: demoPlaintext,
        originalFileName: fileName,
        originalSize: `${content.length} 字节`,
        dekAlgorithm: 'AES-256-GCM (随机 DEK)',
        contentCiphertext: bufferToHexPreview(result.encryptedContent, 32),
        contentCiphertextSize: `${result.encryptedContent.byteLength} 字节`,
        encryptedFileName: result.encryptedName.substring(0, 60) + '...',
        contentNonce: result.contentNonce.substring(0, 24) + '...',
        nameNonce: result.nameNonce.substring(0, 24) + '...',
        encryptedKey: result.encryptedKey.substring(0, 60) + '...',
        encryptedKeyAlgorithm: 'RSA-OAEP (公钥加密 DEK)',
        workflow: '随机DEK → AES加密内容 → RSA加密DEK → 上传服务器',
      },
    });
  }, [keyPair, demoPlaintext]);

  // 步骤 5：解密文档
  const runStep5 = useCallback(async () => {
    if (!keyPair || !encResult) return;
    setStep5({ status: 'running', data: {} });
    const start = performance.now();

    const decrypted = await cryptoService.decryptDocument(
      encResult.encryptedContent,
      encResult.encryptedName,
      encResult.nameNonce,
      encResult.contentNonce,
      encResult.encryptedKey,
      keyPair.privateKey,
    );

    const decryptedText = new TextDecoder().decode(decrypted.content);
    const elapsed = Math.round(performance.now() - start);

    setStep5({
      status: 'done',
      duration: elapsed,
      data: {
        step1: 'RSA 私钥解密 DEK',
        step2: 'DEK 解密文件内容 (AES-GCM)',
        step3: 'DEK 解密文件名 (AES-GCM)',
        decryptedFileName: decrypted.fileName,
        decryptedContent: decryptedText,
        decryptedSize: `${decrypted.content.byteLength} 字节`,
        integrityCheck: decryptedText === demoPlaintext ? '✅ 完整性验证通过' : '❌ 内容不匹配',
      },
    });
  }, [keyPair, encResult, demoPlaintext]);

  // 全部重置
  const resetAll = () => {
    setStep1({ status: 'idle', data: {} });
    setStep2({ status: 'idle', data: {} });
    setStep3({ status: 'idle', data: {} });
    setStep4({ status: 'idle', data: {} });
    setStep5({ status: 'idle', data: {} });
    setMasterKey(null);
    setKeyPair(null);
    setEncResult(null);
  };

  // 一键执行全部步骤
  const runAll = async () => {
    resetAll();

    // Step 1
    setStep1({ status: 'running', data: {} });
    const start1 = performance.now();
    const newSalt = crypto.getRandomValues(new Uint8Array(32));
    const key = await cryptoService.deriveMasterKey(demoPassword, newSalt);
    setMasterKey(key);
    const exportedKey = await crypto.subtle.exportKey('raw', key);
    setStep1({
      status: 'done',
      duration: Math.round(performance.now() - start1),
      data: {
        password: demoPassword,
        algorithm: 'PBKDF2',
        iterations: '100,000',
        hash: 'SHA-256',
        salt: bufferToHexPreview(newSalt.buffer, 16),
        saltLength: `${newSalt.length} 字节`,
        masterKey: bufferToHexPreview(exportedKey, 32),
        keyLength: '256 位 (32 字节)',
        keyUsage: 'AES-GCM 加密/解密',
      },
    });

    // Step 2
    setStep2({ status: 'running', data: {} });
    const start2 = performance.now();
    const kp = await cryptoService.generateKeyPair();
    setKeyPair(kp);
    const pubExported = await crypto.subtle.exportKey('spki', kp.publicKey);
    const privExported = await crypto.subtle.exportKey('pkcs8', kp.privateKey);
    setStep2({
      status: 'done',
      duration: Math.round(performance.now() - start2),
      data: {
        algorithm: 'RSA-OAEP',
        modulusLength: '2048 位',
        publicExponent: '65537 (0x010001)',
        hash: 'SHA-256',
        publicKeyFormat: 'SPKI (SubjectPublicKeyInfo)',
        publicKeySize: `${pubExported.byteLength} 字节`,
        publicKeyPreview: bufferToHexPreview(pubExported, 24),
        privateKeyFormat: 'PKCS8',
        privateKeySize: `${privExported.byteLength} 字节`,
        privateKeyPreview: bufferToHexPreview(privExported, 24),
      },
    });

    // Step 3
    setStep3({ status: 'running', data: {} });
    const start3 = performance.now();
    const encrypted = await cryptoService.encryptPrivateKey(kp.privateKey, key);
    setStep3({
      status: 'done',
      duration: Math.round(performance.now() - start3),
      data: {
        algorithm: 'AES-256-GCM',
        inputFormat: 'PKCS8 私钥',
        nonce: bufferToHexPreview(encrypted.nonce.buffer as ArrayBuffer, 12),
        nonceLength: `${encrypted.nonce.length} 字节`,
        ciphertext: bufferToHexPreview(encrypted.ciphertext, 32),
        ciphertextSize: `${encrypted.ciphertext.byteLength} 字节`,
        storage: '加密私钥 + 盐值 → 发送到服务器存储',
        security: '服务器无法获取明文私钥',
      },
    });

    // Step 4
    setStep4({ status: 'running', data: {} });
    const start4 = performance.now();
    const encoder = new TextEncoder();
    const content = encoder.encode(demoPlaintext);
    const fileName = '机密文档.txt';
    const file = new File([content], fileName, { type: 'text/plain' });
    const encResultNew = await cryptoService.encryptDocument(file, kp.publicKey);
    setEncResult(encResultNew);
    setStep4({
      status: 'done',
      duration: Math.round(performance.now() - start4),
      data: {
        originalContent: demoPlaintext,
        originalFileName: fileName,
        originalSize: `${content.length} 字节`,
        dekAlgorithm: 'AES-256-GCM (随机 DEK)',
        contentCiphertext: bufferToHexPreview(encResultNew.encryptedContent, 32),
        contentCiphertextSize: `${encResultNew.encryptedContent.byteLength} 字节`,
        encryptedFileName: encResultNew.encryptedName.substring(0, 60) + '...',
        contentNonce: encResultNew.contentNonce.substring(0, 24) + '...',
        nameNonce: encResultNew.nameNonce.substring(0, 24) + '...',
        encryptedKey: encResultNew.encryptedKey.substring(0, 60) + '...',
        encryptedKeyAlgorithm: 'RSA-OAEP (公钥加密 DEK)',
        workflow: '随机DEK → AES加密内容 → RSA加密DEK → 上传服务器',
      },
    });

    // Step 5
    setStep5({ status: 'running', data: {} });
    const start5 = performance.now();
    const decrypted = await cryptoService.decryptDocument(
      encResultNew.encryptedContent,
      encResultNew.encryptedName,
      encResultNew.nameNonce,
      encResultNew.contentNonce,
      encResultNew.encryptedKey,
      kp.privateKey,
    );
    const decryptedText = new TextDecoder().decode(decrypted.content);
    setStep5({
      status: 'done',
      duration: Math.round(performance.now() - start5),
      data: {
        step1: 'RSA 私钥解密 DEK',
        step2: 'DEK 解密文件内容 (AES-GCM)',
        step3: 'DEK 解密文件名 (AES-GCM)',
        decryptedFileName: decrypted.fileName,
        decryptedContent: decryptedText,
        decryptedSize: `${decrypted.content.byteLength} 字节`,
        integrityCheck: decryptedText === demoPlaintext ? '✅ 完整性验证通过' : '❌ 内容不匹配',
      },
    });
  };

  const allDone = [step1, step2, step3, step4, step5].every(step => step.status === 'done');

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800">
      {/* 顶部导航 */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="bg-gradient-to-br from-blue-500 to-indigo-600 p-2 rounded-xl shadow-sm">
              <Cloud className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">RustCloud 加密体系演示</h1>
              <p className="text-[11px] text-slate-400">零知识端到端加密可视化</p>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={runAll}
              className="flex items-center space-x-1.5 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors shadow-sm"
            >
              <Play className="w-4 h-4" />
              <span>一键演示全流程</span>
            </button>
            <button
              onClick={resetAll}
              className="flex items-center space-x-1.5 px-3 py-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg text-sm transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              <span>重置</span>
            </button>
            <Link
              to="/login"
              className="text-sm text-blue-600 hover:text-blue-700 font-medium transition-colors"
            >
              返回登录
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        {/* 架构概览 */}
        <section className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center space-x-2">
            <Shield className="w-5 h-5 text-blue-600" />
            <span>加密架构总览</span>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* 密钥层次 */}
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-4">
              <h3 className="font-semibold text-blue-800 text-sm mb-3 flex items-center space-x-1.5">
                <KeyRound className="w-4 h-4" />
                <span>密钥层次结构</span>
              </h3>
              <div className="space-y-2 text-xs">
                <div className="bg-white/70 rounded p-2 border border-blue-100">
                  <span className="font-medium text-blue-700">密码</span>
                  <span className="text-slate-500"> → PBKDF2 →</span>
                  <span className="font-medium text-blue-700"> 主密钥(MK)</span>
                </div>
                <div className="flex justify-center">
                  <ArrowDown className="w-3 h-3 text-blue-300" />
                </div>
                <div className="bg-white/70 rounded p-2 border border-blue-100">
                  <span className="font-medium text-indigo-700">MK</span>
                  <span className="text-slate-500"> → AES-GCM 加密 →</span>
                  <span className="font-medium text-indigo-700"> 加密私钥</span>
                </div>
                <div className="flex justify-center">
                  <ArrowDown className="w-3 h-3 text-blue-300" />
                </div>
                <div className="bg-white/70 rounded p-2 border border-blue-100">
                  <span className="font-medium text-purple-700">RSA 公钥</span>
                  <span className="text-slate-500"> → 加密 →</span>
                  <span className="font-medium text-purple-700"> DEK</span>
                </div>
              </div>
            </div>

            {/* 加密算法 */}
            <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200 rounded-lg p-4">
              <h3 className="font-semibold text-emerald-800 text-sm mb-3 flex items-center space-x-1.5">
                <Lock className="w-4 h-4" />
                <span>核心算法</span>
              </h3>
              <div className="space-y-2 text-xs">
                <div className="bg-white/70 rounded p-2 border border-emerald-100 flex items-start space-x-2">
                  <Hash className="w-3.5 h-3.5 text-emerald-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <span className="font-medium text-emerald-700">PBKDF2</span>
                    <p className="text-slate-500 mt-0.5">10万次迭代 + SHA-256，密码 → 密钥</p>
                  </div>
                </div>
                <div className="bg-white/70 rounded p-2 border border-emerald-100 flex items-start space-x-2">
                  <Key className="w-3.5 h-3.5 text-emerald-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <span className="font-medium text-emerald-700">RSA-2048-OAEP</span>
                    <p className="text-slate-500 mt-0.5">非对称加密，保护文档密钥</p>
                  </div>
                </div>
                <div className="bg-white/70 rounded p-2 border border-emerald-100 flex items-start space-x-2">
                  <Binary className="w-3.5 h-3.5 text-emerald-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <span className="font-medium text-emerald-700">AES-256-GCM</span>
                    <p className="text-slate-500 mt-0.5">认证加密，文档内容 + 文件名</p>
                  </div>
                </div>
              </div>
            </div>

            {/* 安全保证 */}
            <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-lg p-4">
              <h3 className="font-semibold text-amber-800 text-sm mb-3 flex items-center space-x-1.5">
                <ShieldCheck className="w-4 h-4" />
                <span>安全保证</span>
              </h3>
              <div className="space-y-2 text-xs">
                <div className="bg-white/70 rounded p-2 border border-amber-100">
                  <span className="font-medium text-amber-700">🔒 零知识</span>
                  <p className="text-slate-500 mt-0.5">服务器永远无法获取用户明文数据</p>
                </div>
                <div className="bg-white/70 rounded p-2 border border-amber-100">
                  <span className="font-medium text-amber-700">🛡️ 端到端加密</span>
                  <p className="text-slate-500 mt-0.5">文件在浏览器端加密，服务端仅存储密文</p>
                </div>
                <div className="bg-white/70 rounded p-2 border border-amber-100">
                  <span className="font-medium text-amber-700">🔑 前向安全</span>
                  <p className="text-slate-500 mt-0.5">每个文档使用独立随机密钥(DEK)</p>
                </div>
                <div className="bg-white/70 rounded p-2 border border-amber-100">
                  <span className="font-medium text-amber-700">🤝 安全分享</span>
                  <p className="text-slate-500 mt-0.5">基于公钥的零知识密钥重加密</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 输入参数 */}
        <section className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-600 mb-4">📝 演示参数（可自定义）</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-500">模拟用户密码</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={demoPassword}
                  onChange={(e) => setDemoPassword(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg py-2 px-3 pr-10 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none font-mono"
                />
                <button
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2 top-2 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-500">待加密文档内容</label>
              <input
                type="text"
                value={demoPlaintext}
                onChange={(e) => setDemoPlaintext(e.target.value)}
                className="w-full border border-slate-200 rounded-lg py-2 px-3 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
              />
            </div>
          </div>
        </section>

        {/* 五步加密流程 */}
        <div className="space-y-4">
          {/* 步骤 1：密钥派生 */}
          <StepCard
            step={1}
            title="密码派生主密钥 (PBKDF2)"
            description="用户密码通过 PBKDF2 算法派生出 256 位主密钥，用于保护 RSA 私钥"
            icon={Hash}
            status={step1.status}
            onRun={runStep1}
          >
            {step1.status === 'done' && (
              <div className="space-y-3 mt-2">
                <div className="flex items-center space-x-2 text-xs text-slate-500">
                  <span>⏱️ 耗时 {step1.duration}ms</span>
                  <span>•</span>
                  <span>100,000 次 PBKDF2 迭代</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <DataTag label="🔑 输入：用户密码" value={step1.data.password ?? ''} color="amber" />
                  <DataTag label="🧂 随机盐值" value={`${step1.data.salt ?? ''}\n(${step1.data.saltLength ?? ''})`} color="purple" />
                </div>
                <FlowArrow label="PBKDF2 × 100,000 + SHA-256" />
                <DataTag label="🔐 输出：主密钥 (Master Key)" value={`${step1.data.masterKey ?? ''}\n[${step1.data.keyLength ?? ''}] 用途: ${step1.data.keyUsage ?? ''}`} color="green" />
              </div>
            )}
          </StepCard>

          <FlowArrow />

          {/* 步骤 2：RSA 密钥对生成 */}
          <StepCard
            step={2}
            title="生成 RSA-2048 密钥对"
            description="生成非对称密钥对：公钥加密文档密钥，私钥解密文档密钥"
            icon={Key}
            status={step2.status}
            onRun={runStep2}
            disabled={step1.status !== 'done'}
          >
            {step2.status === 'done' && (
              <div className="space-y-3 mt-2">
                <div className="flex items-center space-x-2 text-xs text-slate-500">
                  <span>⏱️ 耗时 {step2.duration}ms</span>
                  <span>•</span>
                  <span>RSA-OAEP + SHA-256</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <DataTag label="🔓 公钥 (Public Key)" value={`格式: ${step2.data.publicKeyFormat ?? ''}\n大小: ${step2.data.publicKeySize ?? ''}\n${step2.data.publicKeyPreview ?? ''}`} color="blue" />
                  <DataTag label="🔒 私钥 (Private Key)" value={`格式: ${step2.data.privateKeyFormat ?? ''}\n大小: ${step2.data.privateKeySize ?? ''}\n${step2.data.privateKeyPreview ?? ''}`} color="red" />
                </div>
                <div className="bg-slate-50 rounded-lg p-3 text-xs text-slate-600 border border-slate-100">
                  <span className="font-medium">💡 </span>
                  公钥存储在服务器，私钥<strong>永不明文传输</strong>——使用主密钥加密后再存储
                </div>
              </div>
            )}
          </StepCard>

          <FlowArrow />

          {/* 步骤 3：加密私钥 */}
          <StepCard
            step={3}
            title="加密私钥 (AES-GCM)"
            description="使用主密钥对 RSA 私钥进行 AES-256-GCM 加密，密文发送到服务器保管"
            icon={Lock}
            status={step3.status}
            onRun={runStep3}
            disabled={step1.status !== 'done' || step2.status !== 'done'}
          >
            {step3.status === 'done' && (
              <div className="space-y-3 mt-2">
                <div className="flex items-center space-x-2 text-xs text-slate-500">
                  <span>⏱️ 耗时 {step3.duration}ms</span>
                  <span>•</span>
                  <span>AES-256-GCM 认证加密</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <DataTag label="🎲 随机数 (Nonce/IV)" value={`${step3.data.nonce ?? ''}\n(${step3.data.nonceLength ?? ''})`} color="purple" />
                  <DataTag label="📦 密文大小" value={step3.data.ciphertextSize ?? ''} color="indigo" />
                </div>
                <DataTag label="🔐 加密后的私钥 (密文)" value={step3.data.ciphertext ?? ''} color="red" />
                <div className="bg-amber-50 rounded-lg p-3 text-xs text-amber-700 border border-amber-100">
                  <span className="font-medium">🔒 安全保证：</span>{step3.data.security ?? ''}。
                  登录时，用户输入密码 → 派生主密钥 → 解密私钥（全在浏览器端完成）
                </div>
              </div>
            )}
          </StepCard>

          <FlowArrow />

          {/* 步骤 4：加密文档 */}
          <StepCard
            step={4}
            title="加密文档 (混合加密)"
            description="随机生成 DEK → AES-GCM 加密内容和文件名 → RSA-OAEP 加密 DEK"
            icon={FileText}
            status={step4.status}
            onRun={runStep4}
            disabled={step2.status !== 'done'}
          >
            {step4.status === 'done' && (
              <div className="space-y-3 mt-2">
                <div className="flex items-center space-x-2 text-xs text-slate-500">
                  <span>⏱️ 耗时 {step4.duration}ms</span>
                  <span>•</span>
                  <span>混合加密方案 (AES + RSA)</span>
                </div>
                {/* 明文 vs 密文对比 */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <DataTag label="📄 原始内容 (明文)" value={step4.data.originalContent ?? ''} color="green" mono={false} />
                  <DataTag label="🔒 加密后 (密文)" value={`${step4.data.contentCiphertext ?? ''}\n[大小: ${step4.data.contentCiphertextSize ?? ''}]`} color="red" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <DataTag label="📁 原始文件名" value={step4.data.originalFileName ?? ''} color="green" mono={false} />
                  <DataTag label="🔒 加密文件名" value={step4.data.encryptedFileName ?? ''} color="red" />
                </div>
                <DataTag label="🔑 加密的文档密钥 (RSA-OAEP)" value={step4.data.encryptedKey ?? ''} color="purple" />
                <div className="bg-blue-50 rounded-lg p-3 text-xs text-blue-700 border border-blue-100">
                  <span className="font-medium">📤 上传到服务器的内容：</span>
                  加密内容 + 加密文件名 + 加密DEK + Nonces。<strong>服务器无法读取任何明文信息。</strong>
                </div>
              </div>
            )}
          </StepCard>

          <FlowArrow />

          {/* 步骤 5：解密文档 */}
          <StepCard
            step={5}
            title="解密文档"
            description="使用 RSA 私钥解密 DEK → 使用 DEK 解密文件内容和文件名"
            icon={Unlock}
            status={step5.status}
            onRun={runStep5}
            disabled={step4.status !== 'done'}
          >
            {step5.status === 'done' && (
              <div className="space-y-3 mt-2">
                <div className="flex items-center space-x-2 text-xs text-slate-500">
                  <span>⏱️ 耗时 {step5.duration}ms</span>
                  <span>•</span>
                  <span>混合解密 (RSA → AES)</span>
                </div>
                {/* 解密流程 */}
                <div className="bg-slate-50 rounded-lg p-3 border border-slate-100 space-y-1.5 text-xs">
                  <div className="flex items-center space-x-2">
                    <span className="font-mono bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">Step 1</span>
                    <span className="text-slate-600">{step5.data.step1}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="font-mono bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">Step 2</span>
                    <span className="text-slate-600">{step5.data.step2}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="font-mono bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">Step 3</span>
                    <span className="text-slate-600">{step5.data.step3}</span>
                  </div>
                </div>
                {/* 解密结果 */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <DataTag label="📁 解密后文件名" value={step5.data.decryptedFileName ?? ''} color="green" mono={false} />
                  <DataTag label="📏 解密后大小" value={step5.data.decryptedSize ?? ''} color="blue" />
                </div>
                <DataTag label="📄 解密后内容" value={step5.data.decryptedContent ?? ''} color="green" mono={false} />
                <div className={`rounded-lg p-3 text-xs border ${step5.data.integrityCheck?.includes('✅') ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                  <span className="font-medium text-sm">{step5.data.integrityCheck}</span>
                  <p className="mt-1 opacity-80">AES-GCM 认证加密保证了数据完整性——如果密文被篡改，解密将会失败。</p>
                </div>
              </div>
            )}
          </StepCard>
        </div>

        {/* 完成总结 */}
        {allDone && (
          <section className="bg-gradient-to-r from-emerald-500 to-teal-600 rounded-xl p-6 text-white shadow-lg animate-in fade-in">
            <div className="flex items-center space-x-3 mb-4">
              <ShieldCheck className="w-8 h-8" />
              <div>
                <h2 className="text-xl font-bold">加密流程演示完成</h2>
                <p className="text-emerald-100 text-sm">全部 5 个步骤已成功执行</p>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-4">
              {[
                { label: '密钥派生', time: step1.duration, algo: 'PBKDF2' },
                { label: '密钥对生成', time: step2.duration, algo: 'RSA-2048' },
                { label: '私钥加密', time: step3.duration, algo: 'AES-GCM' },
                { label: '文档加密', time: step4.duration, algo: '混合加密' },
                { label: '文档解密', time: step5.duration, algo: '混合解密' },
              ].map((item, idx) => (
                <div key={idx} className="bg-white/15 backdrop-blur-sm rounded-lg p-3 text-center">
                  <div className="text-lg font-bold">{item.time}ms</div>
                  <div className="text-xs text-emerald-100">{item.label}</div>
                  <div className="text-[10px] text-emerald-200/80 mt-0.5">{item.algo}</div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 零知识分享说明 */}
        <section className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center space-x-2">
            <Share2 className="w-5 h-5 text-purple-600" />
            <span>零知识文件分享</span>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 text-center">
              <div className="text-2xl mb-2">👤</div>
              <div className="font-semibold text-purple-800">授权者 (Alice)</div>
              <p className="text-purple-600 mt-1">拥有文档密钥(DEK)</p>
            </div>
            <div className="flex flex-col items-center justify-center space-y-1">
              <ArrowRight className="w-5 h-5 text-purple-400 hidden md:block" />
              <ArrowDown className="w-5 h-5 text-purple-400 md:hidden" />
              <div className="bg-purple-100 text-purple-700 px-2 py-1 rounded text-[10px] font-medium text-center">
                1. 私钥解密 DEK<br />2. 用 Bob 公钥重加密
              </div>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
              <div className="text-2xl mb-2">☁️</div>
              <div className="font-semibold text-blue-800">服务器</div>
              <p className="text-blue-600 mt-1">仅中转加密后的 DEK</p>
              <p className="text-red-500 mt-0.5 font-medium">❌ 无法获取明文</p>
            </div>
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 text-center">
              <div className="text-2xl mb-2">👥</div>
              <div className="font-semibold text-emerald-800">被授权者 (Bob)</div>
              <p className="text-emerald-600 mt-1">用自己的私钥解密 DEK</p>
            </div>
          </div>
        </section>

        {/* 页脚 */}
        <footer className="text-center text-xs text-slate-400 py-6">
          RustCloud — 基于 Rust 的加密云存储系统 · 毕业设计项目 · 零知识端到端加密
        </footer>
      </main>
    </div>
  );
}
