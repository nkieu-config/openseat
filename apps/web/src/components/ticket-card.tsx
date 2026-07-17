import QRCode from "react-qr-code";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type TicketStatus = "issued" | "checked_in" | "void";

type TicketCardProps = {
  title: string;
  subtitle: string;
  qrToken: string;
  status?: TicketStatus;
  qrSize?: number;
};

const BADGE_VARIANT: Record<TicketStatus, "default" | "secondary" | "destructive"> = {
  issued: "default",
  checked_in: "secondary",
  void: "destructive",
};

export function TicketCard({ title, subtitle, qrToken, status, qrSize = 132 }: TicketCardProps) {
  const voided = status === "void";
  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base leading-snug">{title}</CardTitle>
          {status ? (
            <Badge variant={BADGE_VARIANT[status]}>{status.replace("_", " ")}</Badge>
          ) : null}
        </div>
        <CardDescription>{subtitle}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-3">
        <div className={cn("rounded-xl bg-white p-3 shadow-sm", voided && "opacity-30")}>
          <QRCode value={qrToken} size={qrSize} />
        </div>
        <p className="font-mono text-[11px] tracking-wide text-muted-foreground">
          {voided ? "Refunded — no longer valid" : `${qrToken.slice(0, 18)}…`}
        </p>
      </CardContent>
    </Card>
  );
}
