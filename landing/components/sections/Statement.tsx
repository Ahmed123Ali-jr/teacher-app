import { SectionMark } from '@/components/ui/SectionMark';

/* القسمُ الثاني — الجملةُ التعريفيّة.
   سطران بدرجة display يتلوّنان تدريجياً مع التمرير.
   وهو السطرُ الوحيدُ المسموحُ فيه التشكيل في الصفحة كلِّها.
   مكوّنُ خادمٍ خالص: لا JS يُشحن لهذا القسم إطلاقاً. */
export function Statement() {
    return (
        <section className="grain relative isolate bg-page px-5 py-8 md:px-6 md:py-9 lg:py-10">
            <SectionMark n={2} />
            <div className="relative z-10 mx-auto mt-8 max-w-column md:mt-9">
                <p className="reveal-text font-semibold">
                    <span className="block">كلُّ ما يُطلَب منك آخرَ العام</span>
                    <span className="block">يجمعه التطبيقُ وأنتَ تُعطي حصّتَك.</span>
                </p>
            </div>
        </section>
    );
}
