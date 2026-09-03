/** @type {import('next').NextConfig} */
const nextConfig = {
    // تصديرٌ ساكن — لا خادمَ ولا دوالّ. يُرفع كما هو إلى Vercel.
    output: 'export',
    images: { unoptimized: true },
    reactStrictMode: true,
};
export default nextConfig;
