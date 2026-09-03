/* إطارُ الجوال — مرسومٌ بالـCSS لا صورةً.
   ولا شقَّ مستطيلٌ على طراز ‎iPhone X–13‎: ذاك جهازٌ متقاعد، والشقُّ
   المستطيلُ هو أوضحُ علامةِ «قالبٍ جاهز» في صفحات الهبوط. فحزٌّ صغيرٌ
   محايدٌ يكفي للإيحاء بالجهاز بلا ادّعاءِ طرازٍ بعينه. */
export function PhoneFrame({ src, alt }: { src?: string; alt: string }) {
    return (
        <div
            className="relative mx-auto w-[248px] overflow-hidden rounded-xl border border-rule
                       bg-sheet md:w-[292px]"
            style={{ aspectRatio: '375 / 812' }}
        >
            {/* الحزُّ العلويّ — ‎5×55‎ بلونِ الحدّ نفسِه فلا يصير عنصراً مستقلّاً */}
            <span
                aria-hidden="true"
                className="absolute inset-x-0 top-4 z-10 mx-auto h-[5px] w-[55px] rounded-full bg-rule"
            />
            {src ? (
                <img
                    src={src}
                    alt={alt}
                    width={600}
                    height={1299}
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover object-top"
                />
            ) : (
                /* لا لقطةَ بعد — يبقى الإطارُ سطحاً هادئاً لا صندوقاً مكسوراً */
                <span className="sr-only">{alt}</span>
            )}
        </div>
    );
}
