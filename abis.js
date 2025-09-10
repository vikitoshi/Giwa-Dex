const DEX_CONFIG = {
  CHAIN_NAME: "GIWA Sepolia",
  CHAIN_ID_DEC: 91342,
  CHAIN_ID_HEX: "0x1644E",
  RPC_URL: "https://sepolia-rpc.giwa.io",
  EXPLORER: "https://sepolia-explorer.giwa.io",

  AMM:   "0xAD153c844CcAC3D2ea991170624200e54730bE74",
  INDSR: "0x89b38c7414ec86eb2cb003c6362cf010b562ff1e",
  FAUCET:"0xE10aec8F99C0645eb2429Fa33390514Afa7E1682",
};

const ABI = {
  ERC20: [
    "function decimals() view returns (uint8)",
    "function symbol() view returns (string)",
    "function balanceOf(address) view returns (uint256)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function approve(address spender, uint256 amount) returns (bool)",
  ],
  AMM: [
    "function FEE_NUM() view returns (uint256)",
    "function FEE_DEN() view returns (uint256)",
    "function getReserves() view returns (uint112 _weth, uint112 _usdc)",
    "function getAmountOut(uint256 amountIn, uint256 reserveIn, uint256 reserveOut) pure returns (uint256)",
    "function quote(uint256 amountA, uint256 reserveA, uint256 reserveB) pure returns (uint256)",
    "function swapExactETHForUSDC(uint256 amountOutMin, address to) payable returns (uint256 amountOut)",
    "function swapExactUSDCForETH(uint256 amountIn, uint256 amountOutMin, address to) returns (uint256 amountOutETH)",
    "function addLiquidity(uint256 amountUSDCDesired, uint256 amountUSDCMin) payable returns (uint256 liquidity, uint256 usedETH, uint256 usedUSDC)",
  ],
  FAUCET: [
    "function amountPerClaim() view returns (uint256)",
    "function maxClaims() view returns (uint8)",
    "function canClaim(address user) view returns (bool ok, uint8 remaining)",
    "function claim()",
    "function owner() view returns (address)",
    "function setAmountPerClaim(uint256 amt)",
    "function setMaxClaims(uint8 m)"
  ],
};
