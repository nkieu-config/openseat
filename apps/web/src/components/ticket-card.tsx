import QRCode from "react-qr-code";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type TicketCardProps = {
  title: string;
  subtitle: string;
  qrToken: string;
  status?: "issued" | "checked_in" | "void";
  qrSize?: number;
};

export function TicketCard({ title, subtitle, qrToken, status, qrSize = 132 }: TicketCardProps) {
  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base leading-snug">{title}</CardTitle>
          {status ? (
            <Badge variant={status === "issued" ? "default" : "secondary"}>
              {status.replace("_", " ")}
            </Badge>
          ) : null}
        </div>
        <CardDescription>{subtitle}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-3">
        <div className="rounded-xl bg-white p-3 shadow-sm">
          <QRCode value={qrToken} size={qrSize} />
        </div>
        <p className="font-mono text-[11px] tracking-wide text-muted-foreground">
          {qrToken.slice(0, 18)}…
        </p>
      </CardContent>
    </Card>
  );
}
