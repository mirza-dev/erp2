import { notFound } from "next/navigation";
import { dbGetQuote } from "@/lib/supabase/quotes";
import { mapQuoteDetail } from "@/lib/api-mappers";
import QuoteForm from "../_components/QuoteForm";

export default async function QuoteEditPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const row = await dbGetQuote(id);
    if (!row) notFound();
    const data = mapQuoteDetail(row);
    return <QuoteForm initialData={data} />;
}
