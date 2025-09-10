const {
  BrowserProvider,
  JsonRpcProvider,
  Contract,
  parseEther,
  formatEther,
  parseUnits,
  formatUnits,
} = ethers;

const CONFIG = {
  RPC_URL: 'https://sepolia-rpc.giwa.io',
  CHAIN_ID_DEC: 91342,
  CHAIN_ID_HEX: '0x164CE',
  CHAIN_NAME: 'GIWA Sepolia',
  NATIVE_SYMBOL: 'ETH',
  EXPLORER: 'https://sepolia-explorer.giwa.io',
  AMM_ADDRESS: '0xAD153c844CcAC3D2ea991170624200e54730bE74',
  INSDR_ADDRESS: '0x89b38c7414ec86eb2cb003c6362cf010b562ff1e',
  FAUCET_ADDRESS: '0xE10aec8F99C0645eb2429Fa33390514Afa7E1682'
};

const AMM_ABI = [
  "function FEE_NUM() view returns (uint256)",
  "function FEE_DEN() view returns (uint256)",
  "function WETH() view returns (address)",
  "function USDC() view returns (address)",
  "function getReserves() view returns (uint112 _weth, uint112 _usdc)",
  "function getAmountOut(uint256 amountIn, uint256 reserveIn, uint256 reserveOut) pure returns (uint256)",
  "function balanceOf(address) view returns (uint256)", 
  "function totalSupply() view returns (uint256)",
  "function addLiquidity(uint256 amountUSDCDesired, uint256 amountUSDCMin) payable returns (uint256 liquidity, uint256 usedETH, uint256 usedUSDC)",
  "function removeLiquidity(uint256 liquidity, bool receiveETH) returns (uint256 amountWETH, uint256 amountUSDC)",
  "function swapExactETHForUSDC(uint256 amountOutMin, address to) payable returns (uint256 amountOut)",
  "function swapExactUSDCForETH(uint256 amountIn, uint256 amountOutMin, address to) returns (uint256 amountOutETH)",
];

const ERC20_ABI = [
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)"
];

const FAUCET_ABI = [
  "function claim()",
  "function canClaim(address user) view returns (bool ok, uint8 remaining)",
  "function amountPerClaim() view returns (uint256)",
  "function maxClaims() view returns (uint8)"
];

let providerRead = new JsonRpcProvider(CONFIG.RPC_URL);
let provider, signer, account;
let amm, token;
let tokenDecimals = 18;
let feeNum = 0n, feeDen = 1n;

let slippage = 0.5;
let slippageLiq = 0.5;

const el = id => document.getElementById(id);
const fmt = (n, d = 4) => Number(n).toLocaleString(undefined, { maximumFractionDigits: d });
const toPct = (x) => `${(x*100).toFixed(2)}%`;

function toast(msg, kind='ok', link=null){
  const wrap = document.getElementById('toasts');
  const t = document.createElement('div');
  t.className = `toast ${kind}`;
  t.innerHTML = link ? `${msg}<br/><a href="${link}" target="_blank" rel="noreferrer">View on Explorer</a>` : msg;
  wrap.appendChild(t);
  setTimeout(()=>{ t.remove(); }, 6000);
}

function pushTx(kind, hash, extra=''){
  const list = el('txList');
  if (list.firstElementChild && list.firstElementChild.classList.contains('muted')) list.innerHTML = '';
  const li = document.createElement('li');
  li.className = 'tx-item';
  const left = document.createElement('div');
  left.className = 'tx-left';
  const badge = document.createElement('span');
  badge.className = 'badge';
  badge.textContent = kind;
  const meta = document.createElement('div');
  meta.className = 'tx-meta';
  meta.innerHTML = `<div>${extra}</div><small>${new Date().toLocaleString()}</small>`;
  left.appendChild(badge);
  left.appendChild(meta);
  const right = document.createElement('div');
  right.className = 'tx-right';
  right.innerHTML = `<a href="${CONFIG.EXPLORER}/tx/${hash}" target="_blank" rel="noreferrer">Explorer ↗</a>`;
  li.appendChild(left); li.appendChild(right);
  list.prepend(li);
}

function setImpactBadge(pct){
  const badge = el('impactBadge');
  const t = el('impact');
  t.textContent = `${pct.toFixed(2)}%`;
  badge.classList.remove('ok','warn','err');
  if (pct > 5) badge.classList.add('err');
  else if (pct > 1) badge.classList.add('warn');
  else badge.classList.add('ok');
}

function setNet(connected){
  el('netDot').classList.toggle('ok', !!connected);
  el('netText').textContent = connected ? `Connected • ${CONFIG.CHAIN_NAME}` : 'Not connected';
  el('addr').style.display = connected ? 'block' : 'none';
  el('btnConnect').disabled = !!connected;
  el('btnConnect').textContent = connected ? 'Connected ✅' : 'Connect Wallet';
  el('btnDisconnect').style.display = connected ? 'inline-flex' : 'none';
}

function isFromETH(){ return el('fromToken').value === 'ETH'; }
function outSymbol(){ return isFromETH() ? 'INSDR' : 'ETH'; }

async function initRead() {
  amm = new Contract(CONFIG.AMM_ADDRESS, AMM_ABI, providerRead);
  token = new Contract(CONFIG.INSDR_ADDRESS, ERC20_ABI, providerRead);
  try {
    tokenDecimals = await token.decimals();
  } catch { tokenDecimals = 18; }
  try {
    feeNum = await amm.FEE_NUM();
    feeDen = await amm.FEE_DEN();
  } catch {
    feeNum = 3n; feeDen = 1000n; 
  }
}

async function ensureChain(){
  const eth = window.ethereum;
  if (!eth) throw new Error('No EVM wallet found');
  try {
    await eth.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: CONFIG.CHAIN_ID_HEX }]
    });
  } catch (e){
    if (e.code === 4902 || (e.data && e.data.originalError && e.data.originalError.code === 4902)) {
      await eth.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: CONFIG.CHAIN_ID_HEX,
          chainName: CONFIG.CHAIN_NAME,
          nativeCurrency: { name: CONFIG.NATIVE_SYMBOL, symbol: CONFIG.NATIVE_SYMBOL, decimals: 18 },
          rpcUrls: [CONFIG.RPC_URL],
          blockExplorerUrls: [CONFIG.EXPLORER]
        }]
      });
    } else {
      throw e;
    }
  }
}

async function connect(){
  await ensureChain(); 
  const eth = window.ethereum;
  provider = new BrowserProvider(eth);
  const accs = await eth.request({ method: 'eth_requestAccounts' });
  account = accs[0];
  signer = await provider.getSigner();
  amm = new Contract(CONFIG.AMM_ADDRESS, AMM_ABI, signer);
  token = new Contract(CONFIG.INSDR_ADDRESS, ERC20_ABI, signer);

  el('addr').textContent = `${account.slice(0,6)}…${account.slice(-4)}`;
  setNet(true);
  await refreshAll();
  toast('Wallet connected', 'ok');
}

function disconnect(){
  provider = undefined; signer = undefined; account = undefined;
  setNet(false);
  ['balanceText','liqEthBal','liqIndsrBal','lpBal','lpShare','lpEth','lpToken'].forEach(id=>{ const e=el(id); if(e) e.textContent='—';});
  toast('Disconnected','ok');
}

async function getBalances(){
  if (!account) { el('balanceText').textContent='Balance: —'; return; }
  if (isFromETH()){
    const bal = await provider.getBalance(account);
    el('balanceText').textContent = `Balance: ${fmt(formatEther(bal))} ETH`;
  } else {
    const b = await token.balanceOf(account);
    el('balanceText').textContent = `Balance: ${fmt(formatUnits(b, tokenDecimals))} INSDR`;
  }
}

async function refreshReserves(){
  const [weth, usdc] = await amm.getReserves();
  const mid = Number(usdc) / Number(weth); 
  el('reserves').textContent = `${fmt(formatEther(weth))} ETH / ${fmt(formatUnits(usdc, tokenDecimals))} INSDR`;
  el('priceMid').textContent = `${mid.toFixed(6)} INSDR per ETH`;
  const feePct = Number(feeNum) / Number(feeDen) * 100;
  el('feeLine').textContent = `${feeNum.toString()}/${feeDen.toString()} (${feePct.toFixed(2)}%)`;
  el('liqRes').textContent = `${fmt(formatEther(weth))} ETH / ${fmt(formatUnits(usdc, tokenDecimals))} INSDR`;
  return { weth, usdc, mid };
}

function minOutFromSlippage(outBN, decimals){
  const out = Number(formatUnits(outBN, decimals));
  const min = out * (1 - slippage/100);
  return { out, min };
}

async function quote(){
  try{
    const v = el('amountIn').value.trim();
    if (!v || Number(v) <= 0){
      el('quote').textContent = '—';
      el('minOut').textContent = 'Min received: —';
      el('priceExec').textContent = '—';
      setImpactBadge(0);
      return;
    }
    const amt = isFromETH() ? parseEther(v) : parseUnits(v, tokenDecimals);
    const { weth, usdc, mid } = await refreshReserves();
    const reserveIn = isFromETH() ? weth : usdc;
    const reserveOut = isFromETH() ? usdc : weth;
    const outBN = await amm.getAmountOut(amt, reserveIn, reserveOut);
    const out = isFromETH() ? Number(formatUnits(outBN, tokenDecimals)) : Number(formatEther(outBN));
    el('quote').textContent = out.toFixed(6);

    const decimals = isFromETH() ? tokenDecimals : 18;
    const { min } = minOutFromSlippage(outBN, decimals);
    el('minOut').textContent = `Min received: ${min.toFixed(6)} ${outSymbol()}`;

    const exec = isFromETH()
      ? (out / Number(v))
      : (Number(v) / out);
    el('priceExec').textContent = `${exec.toFixed(6)} INSDR per ETH`;
    const impact = Math.abs(exec - mid) / mid * 100;
    setImpactBadge(isFinite(impact) ? impact : 0);

    const recToken = isFromETH()
      ? (Number(v) * mid)
      : Number(v); 
    el('liqReco').textContent = isFinite(recToken) ? `${recToken.toFixed(6)} INSDR` : '—';
    const minToken = recToken * (1 - slippageLiq/100);
    el('liqMin').textContent = isFinite(minToken) ? `${minToken.toFixed(6)} INSDR` : '—';
  }catch(e){
    console.error(e);
  }
}

async function refreshBalancesBox(){
  if (!account || !provider) return;
  const ethBal = await provider.getBalance(account);
  const tBal = await token.balanceOf(account);
  el('liqEthBal').textContent = `Balance: ${fmt(formatEther(ethBal))} ETH`;
  el('liqIndsrBal').textContent = `Balance: ${fmt(formatUnits(tBal, tokenDecimals))} INSDR`;
}

async function refreshMyPools(){
  if (!account) return;
  const reserves = await amm.getReserves();
  const totalSupply = await amm.totalSupply();
  const lpBal = await amm.balanceOf(account);

  const share = totalSupply > 0n ? Number(lpBal) / Number(totalSupply) : 0;
  const ethUnderlying = totalSupply > 0n ? Number(formatEther(reserves[0])) * share : 0;
  const tUnderlying = totalSupply > 0n ? Number(formatUnits(reserves[1], tokenDecimals)) * share : 0;

  el('lpBal').textContent = totalSupply > 0n ? fmt(formatUnits(lpBal, 18)) : '0';
  el('lpShare').textContent = totalSupply > 0n ? toPct(share) : '0%';
  el('lpEth').textContent = fmt(ethUnderlying) + ' ETH';
  el('lpToken').textContent = fmt(tUnderlying) + ' INSDR';
}

async function refreshAll(){
  await Promise.all([
    refreshReserves(),
    getBalances(),
    refreshBalancesBox(),
    refreshMyPools(),
    refreshFaucetButton()
  ]);
  await quote();
}

async function ensureApproval(spender, amount){
  const allowance = await token.allowance(account, spender);
  if (allowance >= amount) return true;
  try{
    const tx = await token.approve(spender, ethers.MaxUint256);
    const rc = await tx.wait();
    pushTx('Approve', rc.hash, 'INSDR approval granted');
    toast('Approve INSDR success', 'ok', `${CONFIG.EXPLORER}/tx/${rc.hash}`);
    return true;
  }catch(e){
    console.error(e);
    toast('Approve failed', 'err');
    return false;
  }
}

async function doSwap(){
  if (!signer) return toast('Connect wallet first','err');

  const v = el('amountIn').value.trim();
  if (!v || Number(v) <= 0) return toast('Enter amount','err');

  try{
    const [weth, usdc] = await amm.getReserves();

    if (weth === undefined || usdc === undefined) {
      return toast('Pool reserves unavailable', 'err');
    }
    if (weth === 0n || usdc === 0n) {
      return toast('Pool has zero reserves', 'err');
    }

    const amtIn = isFromETH() ? parseEther(v) : parseUnits(v, tokenDecimals);
    const reserveIn  = isFromETH() ? weth : usdc;
    const reserveOut = isFromETH() ? usdc : weth;

    const outBN  = await amm.getAmountOut(amtIn, reserveIn, reserveOut);
    const slipBP = BigInt(Math.floor(slippage * 1000));   
    const minOut = outBN - (outBN * slipBP / 100000n);    

    let tx;
    if (isFromETH()){
      tx = await amm.swapExactETHForUSDC(minOut, account, { value: amtIn });
    } else {
      const ok = await ensureApproval(CONFIG.AMM_ADDRESS, amtIn);
      if (!ok) return;
      tx = await amm.swapExactUSDCForETH(amtIn, minOut, account);
    }

    el('swapStatus').textContent = 'Pending…';
    const rc = await tx.wait();
    el('swapStatus').textContent = 'Success ✔';
    pushTx('Swap', rc.hash, `${v} ${isFromETH() ? 'ETH' : 'INSDR'} → ${outSymbol()}`);
    toast('Swap success', 'ok', `${CONFIG.EXPLORER}/tx/${rc.hash}`);
    await refreshAll();

  } catch (e){
    console.error(e);
    el('swapStatus').textContent = 'Error';
    toast(e?.data?.message || e?.message || 'Swap failed', 'err');
  }
}

async function doAddLiq(){
  if (!signer) return toast('Connect wallet first','err');
  const vEth = el('liqEth').value.trim();
  const vT = el('liqIndsr').value.trim();
  if (!vEth || !vT) return toast('Enter ETH and INSDR amounts','err');
  const amtEth = parseEther(vEth);
  const amtT = parseUnits(vT, tokenDecimals);
  const minT = amtT - (amtT * BigInt(Math.floor(slippageLiq*1000)) / 100000n);

  try{
    const ok = await ensureApproval(CONFIG.AMM_ADDRESS, amtT);
    if (!ok) return;
    const tx = await amm.addLiquidity(amtT, minT, { value: amtEth });
    el('liqStatus').textContent = 'Pending…';
    const rc = await tx.wait();
    el('liqStatus').textContent = 'Success ✔';
    pushTx('AddLiq', rc.hash, `${vEth} ETH + ${vT} INSDR`);
    toast('Add liquidity success','ok', `${CONFIG.EXPLORER}/tx/${rc.hash}`);
    el('liqEth').value=''; el('liqIndsr').value='';
    await refreshAll();
  }catch(e){
    console.error(e);
    el('liqStatus').textContent = 'Error';
    toast(e?.data?.message || e?.message || 'Add liquidity failed', 'err');
  }
}

async function doRemoveLiq(){
  if (!signer) return toast('Connect wallet first','err');
  const pct = Number(el('rmPct').value);
  if (!(pct>0)) return toast('Enter percentage to remove','err');
  try{
    const lpBal = await amm.balanceOf(account);
    const receiveETH = (el('rmReceive').value === 'eth');
    const burn = (lpBal * BigInt(Math.floor(pct))) / 100n;
    if (burn <= 0n) return toast('Nothing to remove','err');

    const tx = await amm.removeLiquidity(burn, receiveETH);
    el('rmStatus').textContent = 'Pending…';
    const rc = await tx.wait();
    el('rmStatus').textContent = 'Success ✔';
    pushTx('RemoveLiq', rc.hash, `Burned ${formatUnits(burn,18)} LP`);
    toast('Remove liquidity success','ok', `${CONFIG.EXPLORER}/tx/${rc.hash}`);
    el('rmPct').value = '';
    await refreshAll();
  }catch(e){
    console.error(e);
    el('rmStatus').textContent = 'Error';
    toast(e?.data?.message || e?.message || 'Remove liquidity failed', 'err');
  }
}

const faucetRead = new Contract(CONFIG.FAUCET_ADDRESS, FAUCET_ABI, providerRead);

async function refreshFaucetButton(){
  try{
    const amt = await faucetRead.amountPerClaim().catch(()=>null);
    if (amt) el('btnClaim').textContent = `Claim ${fmt(formatUnits(amt, tokenDecimals))} INSDR`;
    if (account){
      const c = new Contract(CONFIG.FAUCET_ADDRESS, FAUCET_ABI, signer||providerRead);
      const [ok, remaining] = await c.canClaim(account);
      el('btnClaim').disabled = !ok || remaining === 0;
      el('faucetStatus').textContent = ok ? `Claims remaining: ${remaining}` : 'Not eligible';
    } else {
      el('btnClaim').disabled = false;
    }
  }catch{}
}

async function doClaim(){
  if (!signer) return toast('Connect wallet first','err');
  const f = new Contract(CONFIG.FAUCET_ADDRESS, FAUCET_ABI, signer);
  try{
    const tx = await f.claim();
    el('faucetStatus').textContent = 'Pending…';
    const rc = await tx.wait();
    el('faucetStatus').textContent = 'Success ✔';
    pushTx('Faucet', rc.hash, 'Claim INSDR');
    toast('Claim success','ok', `${CONFIG.EXPLORER}/tx/${rc.hash}`);
    await refreshAll();
  }catch(e){
    console.error(e);
    let msg = e?.data?.message || e?.message || 'Claim failed';
    if (msg.includes('execution reverted')) msg = 'Claim reverted — faucet limit or balance exceeded';
    el('faucetStatus').textContent = 'Error';
    toast(msg,'err');
  }
}

(function setupSlippage(){
  const modal = el('slipModal');
  const openers = [el('btnSlip'), el('btnSlipLiq')];
  const save = el('slipSave'), cancel = el('slipCancel'), close = el('slipClose'), back = el('slipBackdrop');
  const input = el('slipInput');
  document.querySelectorAll('.chip.preset').forEach(c=>{
    c.addEventListener('click', ()=>{ input.value = c.dataset.val; });
  });
  function show(){ modal.classList.add('show'); input.value = slippage.toString(); }
  function hide(){ modal.classList.remove('show'); }
  openers.forEach(b=> b?.addEventListener('click', show));
  cancel.addEventListener('click', hide);
  close.addEventListener('click', hide);
  back.addEventListener('click', hide);
  save.addEventListener('click', ()=>{
    const v = Number(input.value);
    if (isNaN(v) || v<0){ toast('Invalid slippage','err'); return; }
    slippage = v; slippageLiq = v;
    el('slipVal').textContent = `${slippage}%`;
    el('slipValLiq').textContent = `${slippage}%`;
    hide();
    quote();
  });
})();

function showView(id){
  ['view-swap','view-liq','view-faucet'].forEach(v=>{
    const n = el(v);
    if (!n) return;
    n.classList.toggle('hidden', v!==id);
  });
  ['tab-swap','tab-liq','tab-faucet'].forEach(t=>{
    const b = el(t);
    b.classList.toggle('active', `view-${t.split('-')[1]}`===id);
  });
}
['tab-swap','tab-liq','tab-faucet'].forEach(t=>{
  el(t).addEventListener('click', ()=>{
    const id = `view-${t.split('-')[1]}`;
    showView(id);
  });
});

el('btnConnect').addEventListener('click', connect);
el('btnDisconnect').addEventListener('click', disconnect);

el('fromToken').addEventListener('change', async ()=>{
  el('toToken').value = isFromETH() ? 'INSDR' : 'ETH';
  await getBalances(); await quote(); await toggleApproveButtons();
});
el('btnFlip').addEventListener('click', ()=>{
  const cur = el('fromToken').value;
  el('fromToken').value = cur==='ETH' ? 'INSDR':'ETH';
  el('toToken').value = cur==='ETH' ? 'ETH':'INSDR';
  getBalances(); quote(); toggleApproveButtons();
});
el('btnMax').addEventListener('click', async ()=>{
  if (!account || !provider) return;
  if (isFromETH()){
    const bal = await provider.getBalance(account);
    const use = bal - parseEther('0.0002'); 
    el('amountIn').value = use > 0n ? formatEther(use) : '0';
  } else {
    const b = await token.balanceOf(account);
    el('amountIn').value = formatUnits(b, tokenDecimals);
  }
  quote(); toggleApproveButtons();
});
el('amountIn').addEventListener('input', ()=>{ quote(); toggleApproveButtons(); });
el('btnApprove').addEventListener('click', async ()=>{
  const v = el('amountIn').value.trim();
  if (!v) return;
  const amt = parseUnits(v, tokenDecimals);
  await ensureApproval(CONFIG.AMM_ADDRESS, amt);
});
el('btnSwap').addEventListener('click', doSwap);

el('btnAddLiq').addEventListener('click', doAddLiq);
el('btnLiqApprove').addEventListener('click', async ()=>{
  const vT = el('liqIndsr').value.trim();
  if (!vT) return;
  await ensureApproval(CONFIG.AMM_ADDRESS, parseUnits(vT, tokenDecimals));
});
el('btnRemoveLiq').addEventListener('click', doRemoveLiq);
el('btnRefreshPools').addEventListener('click', refreshMyPools);

el('btnClaim').addEventListener('click', doClaim);

el('txClear').addEventListener('click', ()=>{
  el('txList').innerHTML = '<li class="muted">No recent transactions.</li>';
});

async function toggleApproveButtons(){
  try{
    if (!account) { el('btnApprove').style.display='none'; el('btnLiqApprove').style.display='none'; return; }
    if (!isFromETH()){
      const v = el('amountIn').value.trim();
      if (v){
        const amt = parseUnits(v, tokenDecimals);
        const allowance = await token.allowance(account, CONFIG.AMM_ADDRESS);
        el('btnApprove').style.display = allowance >= amt ? 'none' : 'inline-flex';
      } else {
        el('btnApprove').style.display = 'none';
      }
    } else {
      el('btnApprove').style.display = 'none';
    }
    const vT = el('liqIndsr').value.trim();
    if (vT){
      const amtL = parseUnits(vT, tokenDecimals);
      const allowanceL = await token.allowance(account, CONFIG.AMM_ADDRESS);
      el('btnLiqApprove').style.display = allowanceL >= amtL ? 'none' : 'inline-flex';
    } else {
      el('btnLiqApprove').style.display = 'none';
    }
  }catch{}
}
['liqIndsr'].forEach(id=>{
  el(id).addEventListener('input', toggleApproveButtons);
  el(id).addEventListener('change', toggleApproveButtons);
});

(async function main(){
  await initRead();
  setNet(false);
  await refreshReserves();
  quote();

  if (window.ethereum){
    window.ethereum.on?.('accountsChanged', async (a)=>{
      if (!a?.length){ disconnect(); return; }
      account = a[0];
      signer = await (new BrowserProvider(window.ethereum)).getSigner();
      amm = new Contract(CONFIG.AMM_ADDRESS, AMM_ABI, signer);
      token = new Contract(CONFIG.INSDR_ADDRESS, ERC20_ABI, signer);
      el('addr').textContent = `${account.slice(0,6)}…${account.slice(-4)}`;
      setNet(true);
      await refreshAll();
    });
    window.ethereum.on?.('chainChanged', async (cid)=>{
      if (cid !== CONFIG.CHAIN_ID_HEX){ setNet(false); }
      await refreshAll();
    });
  }
})();
