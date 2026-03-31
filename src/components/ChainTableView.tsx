import { memo, useCallback, useState } from "react";
import { Chain } from "../types";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowUp,
  ArrowDown,
  Zap,
  Server,
  Clock,
  AlertCircle,
  ChevronRight,
} from "lucide-react";

interface ChainTableViewProps {
  chains: Chain[];
  icmMessageCounts?: Record<string, number>;
  validatorCountBySubnet?: Record<string, number>;
  feesBySubnet?: Record<string, number>;
}

type SortField =
  | "chainName"
  | "networkStatus"
  | "tps"
  | "validators"
  | "nativeToken"
  | "icmMessages"
  | "feesToPChain"
  | "governanceStage"
  | "riskLevel";

type SortOrder = "asc" | "desc" | null;

interface SortConfig {
  field: SortField | null;
  order: SortOrder;
}

// Helper functions
const formatTPS = (tps: Chain["tps"]) => {
  if (!tps || typeof tps.value !== "number") return "N/A";
  if (tps.value < 0.5) return "< 1.0";
  return tps.value.toFixed(2);
};

const getTPSColor = (tpsStr: string) => {
  if (tpsStr === "N/A") return "text-muted-foreground";
  if (tpsStr === "< 1.0") return "text-yellow-500 dark:text-yellow-400";
  const tps = Number(tpsStr);
  if (tps >= 1) return "text-green-500 dark:text-green-400";
  if (tps >= 0.5) return "text-yellow-500 dark:text-yellow-400";
  return "text-red-500 dark:text-red-400";
};

const formatFeesAvax = (nAvax: number | undefined): string => {
  if (nAvax === undefined || nAvax === null) return "N/A";
  const avax = nAvax / 1_000_000_000;
  if (avax === 0) return "0 AVAX";
  if (avax >= 1_000_000) return `${(avax / 1_000_000).toFixed(2)}M AVAX`;
  if (avax >= 1_000) return `${(avax / 1_000).toFixed(2)}K AVAX`;
  return `${avax.toFixed(2)} AVAX`;
};

// Placeholder badge components
const ComingSoonBadge = () => (
  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium bg-muted/60 text-muted-foreground/70 border border-border/50">
    <Clock className="w-2.5 h-2.5" />
    Soon
  </span>
);

// Sort header component
interface SortHeaderProps {
  field: SortField;
  label: string;
  sortConfig: SortConfig;
  onSort: (field: SortField) => void;
  className?: string;
}

const SortHeader = ({
  field,
  label,
  sortConfig,
  onSort,
  className = "",
}: SortHeaderProps) => {
  const isActive = sortConfig.field === field;

  return (
    <th
      className={`px-4 py-3 text-left cursor-pointer select-none transition-colors hover:bg-[rgba(120,120,128,0.12)] ${className}`}
      onClick={() => onSort(field)}
    >
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.5px]">
          {label}
        </span>
        {isActive && sortConfig.order === "asc" && (
          <ArrowUp className="w-3 h-3 text-[#ef4444]" />
        )}
        {isActive && sortConfig.order === "desc" && (
          <ArrowDown className="w-3 h-3 text-[#ef4444]" />
        )}
      </div>
    </th>
  );
};

export const ChainTableView = memo(function ChainTableView({
  chains,
  icmMessageCounts = {},
  validatorCountBySubnet = {},
  feesBySubnet = {},
}: ChainTableViewProps) {
  const navigate = useNavigate();
  const [sortConfig, setSortConfig] = useState<SortConfig>({
    field: null,
    order: null,
  });

  const handleSort = useCallback((field: SortField) => {
    setSortConfig((prev) => {
      if (prev.field === field) {
        if (prev.order === "asc") return { field, order: "desc" };
        if (prev.order === "desc") return { field: null, order: null };
      }
      return { field, order: "asc" };
    });
  }, []);

  const handleNavigate = useCallback(
    (chainId: string) => {
      sessionStorage.setItem(
        "dashboardScrollPosition",
        window.scrollY.toString()
      );
      navigate(`/chain/${chainId}`);
    },
    [navigate]
  );

  // Sort chains based on current sort configuration
  const sortedChains = [...chains].sort((a, b) => {
    if (!sortConfig.field || !sortConfig.order) return 0;

    const order = sortConfig.order === "asc" ? 1 : -1;

    switch (sortConfig.field) {
      case "chainName":
        return order * a.chainName.localeCompare(b.chainName);

      case "tps":
        const tpsA = a.tps?.value ?? -1;
        const tpsB = b.tps?.value ?? -1;
        return order * (tpsA - tpsB);

      case "validators":
        const validatorsA = (a.subnetId ? validatorCountBySubnet[a.subnetId] : undefined) ?? a.validatorCount ?? 0;
        const validatorsB = (b.subnetId ? validatorCountBySubnet[b.subnetId] : undefined) ?? b.validatorCount ?? 0;
        return order * (validatorsA - validatorsB);

      case "nativeToken":
        const tokenA = a.networkToken?.symbol ?? "";
        const tokenB = b.networkToken?.symbol ?? "";
        return order * tokenA.localeCompare(tokenB);

      case "icmMessages":
        const icmA = icmMessageCounts[a.chainName] || 0;
        const icmB = icmMessageCounts[b.chainName] || 0;
        return order * (icmA - icmB);

      case "feesToPChain": {
        const feesA = a.subnetId ? (feesBySubnet[a.subnetId] ?? -1) : -1;
        const feesB = b.subnetId ? (feesBySubnet[b.subnetId] ?? -1) : -1;
        return order * (feesA - feesB);
      }

      case "networkStatus":
      case "governanceStage":
      case "riskLevel":
        return 0;

      default:
        return 0;
    }
  });

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden" style={{ boxShadow: 'var(--card-shadow, none)' }}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px]">
          <thead>
            <tr className="border-b border-border bg-[#f2f2f7] dark:bg-[#2c2c2e]">
              <SortHeader
                field="chainName"
                label="Chain"
                sortConfig={sortConfig}
                onSort={handleSort}
                className="sticky left-0 z-10 bg-[#f2f2f7] dark:bg-[#2c2c2e]"
              />
              <SortHeader
                field="networkStatus"
                label="Status"
                sortConfig={sortConfig}
                onSort={handleSort}
              />
              <SortHeader
                field="tps"
                label="TPS (24h)"
                sortConfig={sortConfig}
                onSort={handleSort}
              />
              <SortHeader
                field="validators"
                label="Validators"
                sortConfig={sortConfig}
                onSort={handleSort}
              />
              <SortHeader
                field="nativeToken"
                label="Token"
                sortConfig={sortConfig}
                onSort={handleSort}
              />
              <SortHeader
                field="icmMessages"
                label="ICM (24h)"
                sortConfig={sortConfig}
                onSort={handleSort}
              />
              <SortHeader
                field="feesToPChain"
                label="Fees to P-Chain"
                sortConfig={sortConfig}
                onSort={handleSort}
              />
              <SortHeader
                field="governanceStage"
                label="Governance"
                sortConfig={sortConfig}
                onSort={handleSort}
              />
              <SortHeader
                field="riskLevel"
                label="Risk"
                sortConfig={sortConfig}
                onSort={handleSort}
              />
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {sortedChains.map((chain, index) => {
              const tpsValue = formatTPS(chain.tps);
              const tpsColor = getTPSColor(tpsValue);
              const validatorCount = (chain.subnetId ? validatorCountBySubnet[chain.subnetId] : undefined) ?? chain.validatorCount ?? 0;
              const feesNAvax = chain.subnetId ? feesBySubnet[chain.subnetId] : undefined;
              const feesDisplay = formatFeesAvax(feesNAvax);

              return (
                <motion.tr
                  key={chain.chainId}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{
                    duration: 0.2,
                    delay: Math.min(index * 0.015, 0.3),
                  }}
                  className="border-b border-border/50 last:border-b-0 hover:bg-[rgba(120,120,128,0.12)] cursor-pointer transition-colors duration-150 group"
                  onClick={() => handleNavigate(chain.chainId)}
                >
                  {/* Chain Name with Logo */}
                  <td className="px-4 py-3.5 sticky left-0 bg-card group-hover:bg-[rgba(120,120,128,0.12)] z-10 transition-colors duration-150">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg overflow-hidden flex-shrink-0 bg-[#f2f2f7] dark:bg-[#2c2c2e] flex items-center justify-center">
                        <img
                          src={chain.chainLogoUri || "/icon-dark-animated.svg"}
                          alt={chain.chainName}
                          className="w-8 h-8 rounded-lg object-cover"
                          onError={(e) => {
                            e.currentTarget.src = "/icon-dark-animated.svg";
                            e.currentTarget.onerror = null;
                          }}
                        />
                      </div>
                      <span className="text-sm font-semibold text-foreground whitespace-nowrap">
                        {chain.chainName}
                      </span>
                    </div>
                  </td>

                  {/* Status */}
                  <td className="px-4 py-3.5">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-green-500/10 text-green-500 dark:text-[#30d158]">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500 dark:bg-[#30d158]"></span>
                      Active
                    </span>
                  </td>

                  {/* TPS */}
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-1.5">
                      <Zap className={`w-3.5 h-3.5 ${tpsColor}`} />
                      <span className={`text-sm font-semibold tabular-nums ${tpsColor}`}>
                        {tpsValue}
                      </span>
                    </div>
                  </td>

                  {/* Validators */}
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-1.5">
                      <Server className="w-3.5 h-3.5 text-muted-foreground/60" />
                      <span className="text-sm font-medium text-foreground tabular-nums">
                        {validatorCount.toLocaleString()}
                      </span>
                    </div>
                  </td>

                  {/* Native Token */}
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2">
                      <img
                        src={
                          chain.networkToken?.logoUri ||
                          chain.chainLogoUri ||
                          "/icon-dark-animated.svg"
                        }
                        alt={chain.networkToken?.symbol || chain.chainName}
                        className="w-4 h-4 rounded-full flex-shrink-0"
                        onError={(e) => {
                          e.currentTarget.src = "/icon-dark-animated.svg";
                          e.currentTarget.onerror = null;
                        }}
                      />
                      <span className="text-sm font-medium text-foreground">
                        {chain.networkToken?.symbol || "N/A"}
                      </span>
                    </div>
                  </td>

                  {/* ICM Messages */}
                  <td className="px-4 py-3.5">
                    {(() => {
                      const count = icmMessageCounts[chain.chainName] || 0;
                      if (count === 0) {
                        return (
                          <span className="text-sm text-muted-foreground/60">—</span>
                        );
                      }
                      return (
                        <span className="text-sm font-semibold text-foreground tabular-nums">
                          {count.toLocaleString()}
                        </span>
                      );
                    })()}
                  </td>

                  {/* Fees to P-Chain */}
                  <td className="px-4 py-3.5">
                    {feesNAvax !== undefined ? (
                      <span className="text-sm font-medium text-foreground tabular-nums">
                        {feesDisplay}
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground/60">—</span>
                    )}
                  </td>

                  {/* Governance */}
                  <td className="px-4 py-3.5">
                    <ComingSoonBadge />
                  </td>

                  {/* Risk */}
                  <td className="px-4 py-3.5">
                    <ComingSoonBadge />
                  </td>

                  {/* Row arrow */}
                  <td className="px-3 py-3.5">
                    <ChevronRight className="w-4 h-4 text-muted-foreground/30 group-hover:text-[#ef4444] transition-colors duration-150" />
                  </td>
                </motion.tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile scroll hint */}
      <div className="md:hidden border-t border-border bg-muted/50 px-4 py-2.5">
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <AlertCircle className="w-3 h-3 flex-shrink-0" />
          <span>Scroll horizontally to see all columns</span>
        </div>
      </div>
    </div>
  );
});
