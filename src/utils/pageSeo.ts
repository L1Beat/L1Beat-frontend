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
    description: 'Supply, volume and holders for every stablecoin on the Avalanche C-Chain: USDC, USDT, BUIDL, EURC and more.',
    url: '/stablecoins',
    image: '/og/stablecoins.png',
  },
  staking: {
    title: 'Avalanche Staking',
    description: 'AVAX staked on the Primary Network: validators, delegations, stake concentration and fees.',
    url: '/staking',
    image: '/og/staking.png',
  },
  treasuries: {
    title: 'AVAX Treasuries & ETFs',
    description: 'How much AVAX public companies and U.S. spot ETFs hold, with each holder\'s share, value and staking.',
    url: '/treasuries',
    image: '/og/treasuries.png',
  },
  trading: {
    title: 'Avalanche Trading Volume',
    description: 'Daily volume, swaps and top pools on Avalanche DEXes: LFJ, Pharaoh, Blackhole, Uniswap, Pangolin and SushiSwap.',
    url: '/trading',
    image: '/og/trading.png',
  },
  bridges: {
    title: 'Avalanche Bridge Flows',
    description: 'Money bridged to and from Avalanche each day, by chain and bridge: CCTP, LayerZero, Avalanche Bridge and more.',
    url: '/bridges',
    image: '/og/bridges.png',
  },
  interchain: {
    title: 'Avalanche Interchain Messages',
    description: 'ICM messages between Avalanche L1s and the C-Chain each day: by chain, by direction, and which L1s are new to it.',
    url: '/interchain',
    image: '/og/interchain.png',
  },
  perps: {
    title: 'Avalanche Perpetuals',
    description: 'Leveraged trading on GMX on Avalanche: daily volume, open interest, fees and liquidations.',
    url: '/perps',
    image: '/og/perps.png',
  },
  lending: {
    title: 'Avalanche Lending Markets',
    description: 'Supply and borrow rates, usage and caps for every lending market on Aave V3, Aave V4 and BENQI on Avalanche.',
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
    image: '/og/api.png',
  },
  brand: {
    title: 'Brand Guidelines',
    description: 'The L1Beat logo, colors, type and writing rules, with downloadable logo files.',
    url: '/brand',
    image: '/og/brand.png',
  },
};
