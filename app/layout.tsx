import type {Metadata} from 'next';
import '@fontsource/manrope/400.css';
import '@fontsource/manrope/500.css';
import '@fontsource/manrope/600.css';
import '@fontsource/manrope/700.css';
import '@fontsource/manrope/800.css';
import '@fontsource/dm-mono/400.css';
import './theme.css';
import './globals.css';
export const metadata:Metadata={title:'Threadline — Follow the detail',description:'An investigative workspace for turning cultural observations into sourced next enquiries.',icons:{icon:'/favicon.svg'}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>;}
