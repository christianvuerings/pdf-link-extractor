import React, { useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import * as XLSX from 'xlsx';

pdfjsLib.GlobalWorkerOptions.workerSrc =
  '../../node_modules/pdfjs-dist/build/pdf.worker.mjs';

type Title = {
  status: number;
  error?: string;
  title?: string;
};

export default function PDFLinkExtractor() {
  const [file, setFile] = useState<File | null>(null);
  const [links, setLinks] = useState<
    {
      url: string;
      page: number;
    }[]
  >([]);
  const [titles, setTitles] = useState<{
    [link: string]: Title;
  }>({});
  const [numPages, setNumPages] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleFileChange: React.ChangeEventHandler<HTMLInputElement> = (
    event,
  ) => {
    const selectedFile = event?.target?.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
    }
  };

  async function fetchTitle(url: string): Promise<Title> {
    try {
      const transformedUrl = new URL(
        'https://get-title-from-url.vercel.app/api/get-title-from-url',
      );
      transformedUrl.searchParams.append('url', url);
      const response = await fetch(transformedUrl, { redirect: 'follow' });

      if (!response.ok) {
        return {
          status: response.status,
        };
      }

      const jsonResponse = await response.json();
      return jsonResponse;
    } catch (error) {
      console.error('Error fetching the title:', error);
      if (error instanceof Error) {
        return {
          status: 500,
          error: error.message,
        };
      } else {
        return {
          status: 500,
          error: 'Could not fetch the title',
        };
      }
    }
  }

  async function fetchTitles(links: string[]) {
    const fetchTitleInfo = async (link: string) => {
      const response = await fetchTitle(link);
      setTitles((previousTitles) => ({ ...previousTitles, [link]: response }));
    };

    links.forEach(fetchTitleInfo);
  }

  const extractLinks = async () => {
    if (!file) return;

    setIsLoading(true);
    const reader = new FileReader();
    reader.readAsArrayBuffer(file);
    reader.onload = async (e) => {
      try {
        if (!e.target) {
          return;
        }
        const pdf = await pdfjsLib.getDocument({
          data: e.target.result as ArrayBuffer,
        }).promise;
        let extractedLinks = [];

        setNumPages(pdf.numPages);

        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const annotations = await page.getAnnotations();
          const pageLinks = annotations
            .filter((a) => a.subtype === 'Link' && (a.url || a.unsafeUrl))
            .map((a) => {
              return { page: i, url: a.url };
            });
          extractedLinks.push(...pageLinks);
        }

        extractedLinks = extractedLinks.filter(
          (obj1, i, arr) =>
            arr.findIndex(
              (obj2) => JSON.stringify(obj2) === JSON.stringify(obj1),
            ) === i,
        );

        fetchTitles([...new Set(extractedLinks.map(({ url }) => url))]);
        setLinks(extractedLinks);
      } catch (error) {
        console.error('Error extracting links:', error);
        alert('An error occurred while extracting links. Please try again.');
      } finally {
        setIsLoading(false);
      }
    };
  };

  const saveAsCSV = () => {
    const csvContent =
      'data:text/csv;charset=utf-8,' +
      'Page,URL\n' +
      links.map((link) => `${link.page},${link.url}`).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', 'extracted_links.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const saveAsXLSX = () => {
    const worksheet = XLSX.utils.json_to_sheet(links);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Links');
    XLSX.writeFile(workbook, 'extracted_links.xlsx');
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="mb-4 text-2xl font-bold">PDF Link Extractor</h1>
      <div className="flex flex-col gap-2">
        <input
          type="file"
          accept=".pdf"
          onChange={handleFileChange}
          className="block w-full rounded border border-gray-200 shadow-sm file:me-4 file:border-0 file:bg-gray-200 file:px-4 file:py-2 focus:z-10 focus:border-blue-500 focus:ring-blue-500"
        />
        <div>
          <button
            onClick={extractLinks}
            disabled={!file || isLoading}
            className={`mr-2 rounded px-4 py-2 ${
              !file || isLoading
                ? 'cursor-not-allowed bg-gray-300'
                : 'bg-blue-500 text-white hover:bg-blue-600'
            }`}
          >
            {isLoading ? 'Extracting...' : 'Extract Links'}
          </button>
          {links.length > 0 && (
            <>
              <button
                onClick={saveAsCSV}
                className="mr-2 rounded bg-green-500 px-4 py-2 text-white hover:bg-green-600"
              >
                Save as CSV
              </button>
              <button
                onClick={saveAsXLSX}
                className="rounded bg-purple-500 px-4 py-2 text-white hover:bg-purple-600"
              >
                Save as XLSX
              </button>
            </>
          )}
        </div>
      </div>

      {numPages && (
        <p className="mt-4">
          Extracted {links.length} links from {numPages} pages.
        </p>
      )}

      {links.length > 0 && (
        <table className="table-auto text-left">
          <thead>
            <tr>
              <th className="px-4 py-1">Page</th>
              <th className="px-4 py-1">Title</th>
              <th className="px-4 py-1">Link</th>
            </tr>
          </thead>
          <tbody>
            {links.map((link, index) => (
              <tr key={index}>
                <td className="px-4 py-1">{link.page}</td>
                <td
                  title={JSON.stringify(titles[link.url], null, 2)}
                  className={`px-4 py-1 ${!titles[link.url]?.status ? 'bg-orange-300' : titles[link.url]?.status === 200 ? 'bg-green-300' : 'bg-rose-300'}`}
                >
                  {titles[link.url]?.title ??
                    titles[link.url]?.error ??
                    titles[link.url]?.status}
                </td>
                <td className="px-4 py-1">
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    {link.url}
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
