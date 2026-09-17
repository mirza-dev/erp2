import { Fragment } from "react";
import type { Block, Section } from "@/lib/marketing/articles";

/**
 * Yazı gövdesi render'ı.
 *
 * `**vurgu**` işaretini `<strong>` React elemanına çevirir. Dizeyi HTML olarak
 * BASMAZ — içerik dosyasına yazılan hiçbir metin etiket üretemez. Tek amaç
 * okunabilirlik; ikinci bir işaretleme sözdizimi eklemeyin, eklenirse içerik
 * MDX'e taşınmalıdır.
 */
function renderInline(text: string) {
    return text.split("**").map((part, i) =>
        i % 2 === 1 ? <strong key={i}>{part}</strong> : <Fragment key={i}>{part}</Fragment>,
    );
}

function renderBlock(b: Block, i: number) {
    switch (b.t) {
        case "p":
            return <p key={i} className="rv-art-p">{renderInline(b.v)}</p>;
        case "ul":
            return (
                <ul key={i} className="rv-art-ul">
                    {b.v.map((li, j) => <li key={j}>{renderInline(li)}</li>)}
                </ul>
            );
        case "ol":
            return (
                <ol key={i} className="rv-art-ol">
                    {b.v.map((li, j) => <li key={j}>{renderInline(li)}</li>)}
                </ol>
            );
        case "note":
            return <p key={i} className="rv-art-note">{renderInline(b.v)}</p>;
        case "table":
            return (
                <div key={i} className="rv-art-tw">
                    <table className="rv-art-table">
                        <thead>
                            <tr>{b.head.map((h) => <th key={h} scope="col">{h}</th>)}</tr>
                        </thead>
                        <tbody>
                            {b.rows.map((row, j) => (
                                <tr key={j}>
                                    {row.map((cell, k) => (
                                        <td key={k}>{cell ? renderInline(cell) : " "}</td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            );
    }
}

export default function ArticleBody({ sections }: { sections: Section[] }) {
    return (
        <>
            {sections.map((s) => (
                <section key={s.h} className="rv-art-sec">
                    <h2 className="rv-art-h2">{s.h}</h2>
                    {s.blocks.map(renderBlock)}
                </section>
            ))}
        </>
    );
}
