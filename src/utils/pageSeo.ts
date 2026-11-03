/**
 * Head tags for pages that render in the browser. The pages use them, and the
 * SSG build writes the same ones into <path>.html, so search results and link
 * previews name the page instead of falling back to the Overview head.
 */
export const PAGE_SEO = {
  metrics: {
    title: 'Network Metrics',
    description: 'Aggregate Avalanche L1 metrics: cross-chain TPS, transactions, validators, gas, fees, and a side-by-side compare tool.',
    url: '/metrics',
    image: '/og/metrics.png',
  },
  stablecoins: {
    title: 'Stablecoins on Avalanche',
    description: 'Live supply, holders, and 24h activity for every major stablecoin on Avalanche C-Chain: USDC, USDT, AUSD, BUIDL, EURC and more.',
    url: '/stablecoins',
    image: '/og/stablecoins.png',
  },
  staking: {
    title: 'Avalanche Staking',
    description: 'AVAX staked on the Primary Network, validators and delegations, stake concentration, delegation fees and upcoming staking period ends.',
    url: '/staking',
    image: '/og/staking.png',
  },
  treasuries: {
    title: 'AVAX Treasuries & ETFs',
    description: "How much AVAX public companies and U.S. spot ETFs hold, with each holder's share, value, staking and the date of its latest figure.",
    url: '/treasuries',
    image: '/og/treasuries.png',
  },
  trading: {
    title: 'Avalanche Trading Volume',
    description: 'Daily trading volume, swaps and top pools on Avalanche C-Chain DEXes: LFJ, Pharaoh, Blackhole, Uniswap, Pangolin and SushiSwap, indexed from the chain.',
    url: '/trading',
    image: '/og/trading.png',
  },
  bridges: {
    title: 'Avalanche Bridge Flows',
    description: 'Daily inflows and outflows through bridges to and from Avalanche: Circle CCTP, LayerZero, Stargate, the Avalanche Bridge and Chainlink CCIP, by chain and token.',
    url: '/bridges',
    image: '/og/bridges.png',
  },
  lending: {
    title: 'Avalanche Lending Markets',
    description: 'Supply and borrow rates, utilization and caps for every lending market on Aave V3, Aave V4 and BENQI on the Avalanche C-Chain, read from the contracts.',
    url: '/lending',
    image: '/og/lending.png',
  },
  burn: {
    title: 'AVAX Burn: Live Avalanche Fee Burn',
    description: 'Live AVAX burned on Avalanche, streamed block by block. Every C-Chain fee, base fee and priority tip, is burned.',
    url: '/burn',
    image: '/og/burn.png',
  },
  api: {
    title: 'API Playground',
    description: 'Test the L1Beat REST and WebSocket APIs live: endpoint catalog, smart params, bookmarks, and history.',
    url: '/api',
  },
  brand: {
    title: 'Brand Guidelines',
    description: 'L1Beat brand kit: logo, colors, typography, usage rules, and downloadable assets.',
    url: '/brand',
  },
};
