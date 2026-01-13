import { memo, useCallback, useState } from "react";
import { Chain } from "../types";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Zap,
  Server,
  Shield,
  Clock,
  AlertCircle,
} from "lucide-react";

interface ChainTableViewProps {
  chains: Chain[];
  icmMessageCounts?: Record<string, number>;
}

type SortField =
  | "chainId"
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
  if (tpsStr === "N/A") return "text-gray-400 dark:text-gray-500";
  if (tpsStr === "< 1.0") return "text-yellow-500 dark:text-yellow-400";
  const tps = Number(tpsStr);
  if (tps >= 1) return "text-green-500 dark:text-green-400";
  if (tps >= 0.5) return "text-yellow-500 dark:text-yellow-400";
  return "text-red-500 dark:text-red-400";
};

const formatTimestamp = (timestamp: number | undefined) => {
  if (!timestamp) return "N/A";
  const date = new Date(timestamp * 1000);
  const now = Date.now();
  const diff = now - date.getTime();
  const minutes = Math.floor(diff / 60000);

  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

// Placeholder badge components for missing data
const NetworkStatusBadge = () => (
  <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-green-500/10 text-green-600 dark:text-green-500 border border-green-500/20">
    <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
    Active
  </span>
);

const ComingSoonBadge = () => (
  <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-gray-500/10 text-gray-500 dark:text-gray-400 border border-gray-500/20">
    <Clock className="w-3 h-3" />
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
      className={`px-3 py-3 text-left cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${className}`}
      onClick={() => onSort(field)}
    >
      <div className="flex items-center gap-2 select-none">
        <span className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
          {label}
        </span>
        {isActive && sortConfig.order === "asc" && (
          <ArrowUp className="w-3.5 h-3.5 text-[#ef4444]" />
        )}
        {isActive && sortConfig.order === "desc" && (
          <ArrowDown className="w-3.5 h-3.5 text-[#ef4444]" />
        )}
        {!isActive && (
          <ArrowUpDown className="w-3.5 h-3.5 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
        )}
      </div>
    </th>
  );
};

export const ChainTableView = memo(function ChainTableView({
  chains,
  icmMessageCounts = {},
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
      case "chainId":
        const idA = a.evmChainId ?? 0;
        const idB = b.evmChainId ?? 0;
        return order * (idA - idB);

      case "chainName":
        return order * a.chainName.localeCompare(b.chainName);

      case "tps":
        const tpsA = a.tps?.value ?? -1;
        const tpsB = b.tps?.value ?? -1;
        return order * (tpsA - tpsB);

      case "validators":
        const validatorsA = a.validatorCount ?? 0;
        const validatorsB = b.validatorCount ?? 0;
        return order * (validatorsA - validatorsB);

      case "nativeToken":
        const tokenA = a.networkToken?.symbol ?? "";
        const tokenB = b.networkToken?.symbol ?? "";
        return order * tokenA.localeCompare(tokenB);

      case "icmMessages":
        const icmA = icmMessageCounts[a.chainName] || 0;
        const icmB = icmMessageCounts[b.chainName] || 0;
        return order * (icmA - icmB);

      // Placeholder sorts for missing data
      case "networkStatus":
      case "feesToPChain":
      case "governanceStage":
      case "riskLevel":
        return 0;

      default:
        return 0;
    }
  });

  return (
    <div className="bg-white dark:bg-[#1a1a1a] rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
      {/* Table container with horizontal scroll */}
      <div className="overflow-x-auto scrollbar-hide">
        <table className="w-full min-w-[1050px]">
          <thead className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-800">
            <tr className="group">
              <SortHeader
                field="chainId"
                label="Chain ID"
                sortConfig={sortConfig}
                onSort={handleSort}
                className="sticky left-0 bg-gray-50 dark:bg-gray-900/50 z-10"
              />
              <SortHeader
                field="chainName"
                label="Chain Name"
                sortConfig={sortConfig}
                onSort={handleSort}
              />
              <SortHeader
                field="networkStatus"
                label="Status"
                sortConfig={sortConfig}
                onSort={handleSort}
              />
              <SortHeader
                field="tps"
                label="TPS (24h Avg)"
                sortConfig={sortConfig}
                onSort={handleSort}
              />
              <SortHeader
                field="validators"
                label="Active Validators"
                sortConfig={sortConfig}
                onSort={handleSort}
              />
              <SortHeader
                field="nativeToken"
                label="Native Token"
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
                label="Fees to P-Chain (Monthly)"
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
              <th className="px-4 py-3 text-left">
                <span className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                  Last Updated
                </span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
            {sortedChains.map((chain, index) => {
              const tpsValue = formatTPS(chain.tps);
              const tpsColor = getTPSColor(tpsValue);

              return (
                <motion.tr
                  key={chain.chainId}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: 0.3,
                    delay: Math.min(index * 0.02, 0.3),
                    ease: [0.25, 0.46, 0.45, 0.94],
                  }}
                  className="hover:bg-gray-50 dark:hover:bg-gray-900/30 cursor-pointer transition-colors group"
                  onClick={() => handleNavigate(chain.chainId)}
                >
                  {/* Chain ID - sticky */}
                  <td className="px-3 py-3 sticky left-0 bg-white dark:bg-[#1a1a1a] group-hover:bg-gray-50 dark:group-hover:bg-gray-900/30 z-10">
                    <code className="text-xs font-mono text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-900/50 px-2 py-1 rounded">
                      {chain.evmChainId || "N/A"}
                    </code>
                  </td>

                  {/* Chain Name with Logo */}
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      {chain.chainLogoUri ? (
                        <img
                          src={chain.chainLogoUri}
                          alt={`${chain.chainName} logo`}
                          className="w-7 h-7 rounded-lg shadow-sm flex-shrink-0 bg-white dark:bg-gray-900"
                          onError={(e) => {
                            e.currentTarget.src = "/icon-dark-animated.svg";
                            e.currentTarget.onerror = null;
                          }}
                        />
                      ) : (
                        <img
                          src="/icon-dark-animated.svg"
                          alt={`${chain.chainName} logo`}
                          className="w-7 h-7 rounded-lg shadow-sm flex-shrink-0 bg-white dark:bg-gray-900"
                        />
                      )}
                      <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                        {chain.chainName}
                      </span>
                    </div>
                  </td>

                  {/* Network Status */}
                  <td className="px-3 py-3">
                    <NetworkStatusBadge />
                  </td>

                  {/* TPS (24h Avg) */}
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-1.5">
                      <Zap className={`w-3.5 h-3.5 ${tpsColor}`} />
                      <span className={`text-sm font-semibold ${tpsColor}`}>
                        {tpsValue}
                      </span>
                    </div>
                  </td>

                  {/* Active Validators */}
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-1.5">
                      <Server className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {chain.validatorCount || 0}
                      </span>
                    </div>
                  </td>

                  {/* Native Token */}
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-1.5">
                      <img
                        src={
                          chain.networkToken?.logoUri ||
                          chain.chainLogoUri ||
                          "/icon-dark-animated.svg"
                        }
                        alt={chain.networkToken?.symbol || chain.chainName}
                        className="w-4 h-4 rounded-full"
                        onError={(e) => {
                          const target = e.currentTarget;
                          if (target.src !== "/icon-dark-animated.svg") {
                            target.src =
                              chain.chainLogoUri || "/icon-dark-animated.svg";
                          }
                        }}
                      />
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {chain.networkToken?.symbol || "N/A"}
                      </span>
                    </div>
                  </td>

                  {/* ICM Messages (24h) */}
                  <td className="px-3 py-3">
                    {(() => {
                      const count = icmMessageCounts[chain.chainName] || 0;
                      if (count === 0) {
                        return (
                          <span className="text-sm text-gray-400 dark:text-gray-500">
                            N/A
                          </span>
                        );
                      }
                      return (
                        <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                          {count.toLocaleString()}
                        </span>
                      );
                    })()}
                  </td>

                  {/* Fees to P-Chain (Monthly) - Coming Soon */}
                  <td className="px-3 py-3">
                    <ComingSoonBadge />
                  </td>

                  {/* Governance Stage - Coming Soon */}
                  <td className="pr-0 pl-2 py-3">
                    <ComingSoonBadge />
                  </td>

                  {/* Risk Level - Coming Soon */}
                  <td className="pl-2 pr-2 py-3">
                    <ComingSoonBadge />
                  </td>

                  {/* Last Updated */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                      <Clock className="w-3 h-3" />
                      <span>{formatTimestamp(chain.tps?.timestamp)}</span>
                    </div>
                  </td>
                </motion.tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile scroll indicator */}
      <div className="lg:hidden border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50 px-4 py-2">
        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
          <AlertCircle className="w-4 h-4" />
          <span>Scroll horizontally to see all columns</span>
        </div>
      </div>
    </div>
  );
});
