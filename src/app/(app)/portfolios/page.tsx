import { Briefcase } from "lucide-react";
import type { Metadata } from "next";

import { EmptyState } from "@/components/empty-state";
import { CreatePortfolioForm } from "@/components/portfolios/create-portfolio-form";
import { RenamePortfolioDialog } from "@/components/portfolios/rename-portfolio-dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getActivePortfolio, getPortfolios } from "@/lib/data/portfolios";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Portfolios" };

export default async function PortfoliosPage() {
  const [portfolios, active] = await Promise.all([
    getPortfolios(),
    getActivePortfolio(),
  ]);

  return (
    <div className="mx-auto grid max-w-2xl gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Portfolios</h1>
        <p className="text-sm text-muted-foreground">
          Group your transactions into separate portfolios. Switch between them
          from the header.
        </p>
      </div>

      <Card>
        <CardContent>
          <CreatePortfolioForm />
        </CardContent>
      </Card>

      {portfolios.length === 0 ? (
        <EmptyState
          icon={<Briefcase className="size-5" />}
          title="No portfolios yet"
          description="Name your first portfolio above to get started."
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Your portfolios</h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {portfolios.map((portfolio) => (
                <li
                  key={portfolio.id}
                  className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 font-medium">
                      <span className="truncate">{portfolio.name}</span>
                      {portfolio.id === active?.id ? (
                        <Badge variant="secondary">Active</Badge>
                      ) : null}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Created {formatDate(portfolio.createdAt)}
                    </p>
                  </div>
                  <RenamePortfolioDialog
                    id={portfolio.id}
                    currentName={portfolio.name}
                  />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
