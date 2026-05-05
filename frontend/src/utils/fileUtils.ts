import * as toGeoJSON from '@tmcw/togeojson';
import JSZip from 'jszip';

export async function parseMapFile(file: File): Promise<any> {
  const extension = file.name.split('.').pop()?.toLowerCase();
  
  if (extension === 'geojson' || extension === 'json') {
    const text = await file.text();
    return JSON.parse(text);
  }
  
  if (extension === 'kml') {
    const text = await file.text();
    const dom = new DOMParser().parseFromString(text, 'text/xml');
    return toGeoJSON.kml(dom);
  }
  
  if (extension === 'kmz') {
    const arrayBuffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);
    
    // Find the primary KML file (usually doc.kml)
    const kmlFiles = Object.keys(zip.files).filter(name => name.toLowerCase().endsWith('.kml'));
    if (kmlFiles.length === 0) throw new Error('No KML file found in KMZ archive.');
    
    const kmlContent = await zip.files[kmlFiles[0]].async('text');
    const dom = new DOMParser().parseFromString(kmlContent, 'text/xml');
    return toGeoJSON.kml(dom);
  }
  
  throw new Error('Unsupported file format. Please upload GeoJSON, KML, or KMZ.');
}
