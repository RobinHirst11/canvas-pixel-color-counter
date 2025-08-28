const maxColorsSlider = document.getElementById('maxColors');
const maxColorsValue = document.getElementById('maxColorsValue');
const sortSelect = document.getElementById('sortBy');

let currentImageData = null;
let currentColorCounts = null;
let currentFileName = '';

maxColorsSlider.addEventListener('input', (e) => {
    maxColorsValue.textContent = e.target.value;
    if (currentImageData) {
        processImageData(currentImageData);
    }
});

sortSelect.addEventListener('change', () => {
    if (currentColorCounts) {
        drawColorSwatch(currentColorCounts);
    }
});

document.getElementById("image").addEventListener('change', (e) => {
    currentFileName = e.target.files[0]?.name || 'image';
    loadImage(e.target.files[0]);
}, false);

document.getElementById('export-csv').addEventListener('click', exportCSV);
document.getElementById('export-json').addEventListener('click', exportJSON);
document.getElementById('export-palette').addEventListener('click', exportPalette);

function loadImage(file) {
    if (!file) return;
    
    const url = window.URL.createObjectURL(file);
    const img = new Image();
    img.src = url;    
    img.onload = () => {
        reset();

        const canvas = document.getElementById('canvas');
        canvas.width = img.width;
        canvas.height = img.height;

        const context = canvas.getContext('2d', { willReadFrequently: true });
        context.drawImage(img, 0, 0);   
                
        const uploadContainer = document.getElementById('upload-container');        
        uploadContainer.appendChild(img);

        currentImageData = context.getImageData(0, 0, canvas.width, canvas.height);

        window.URL.revokeObjectURL(url);
        
        showWaitIndicator();
        setTimeout(() => processImageData(currentImageData), 50);
    }  
}

function processImageData(imageData) {
    const maxColors = parseInt(maxColorsSlider.value);
    currentColorCounts = medianCutQuantization(imageData.data, maxColors);
    
    drawColorSwatch(currentColorCounts);
    hideWaitIndicator();
    
    const colorCountLabel = document.getElementById('color-count');
    colorCountLabel.innerText = Object.keys(currentColorCounts).length.toLocaleString();
    
    const totalPixels = Object.values(currentColorCounts).reduce((a, b) => a + b, 0);
    document.getElementById('total-pixels').innerText = totalPixels.toLocaleString();
    
    const methodText = `Median Cut quantization - ${maxColorsSlider.value} color palette`;
    document.getElementById('analysis-method').innerText = methodText;

    const pixelCountContainer = document.getElementById('pixel-count-container'); 
    pixelCountContainer.scrollIntoView({ behavior: 'smooth'});
}

function medianCutQuantization(data, maxColors) {
    const pixels = [];
    for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const a = data[i + 3];
        
        if (a > 0) {
            pixels.push({ r, g, b });
        }
    }

    const initialBucket = {
        pixels: pixels,
        minR: Math.min(...pixels.map(p => p.r)),
        maxR: Math.max(...pixels.map(p => p.r)),
        minG: Math.min(...pixels.map(p => p.g)),
        maxG: Math.max(...pixels.map(p => p.g)),
        minB: Math.min(...pixels.map(p => p.b)),
        maxB: Math.max(...pixels.map(p => p.b))
    };

    const buckets = [initialBucket];

    while (buckets.length < maxColors) {
        let maxRange = 0;
        let bucketToSplit = 0;
        
        for (let i = 0; i < buckets.length; i++) {
            const bucket = buckets[i];
            const rRange = bucket.maxR - bucket.minR;
            const gRange = bucket.maxG - bucket.minG;
            const bRange = bucket.maxB - bucket.minB;
            const range = Math.max(rRange, gRange, bRange);
            
            if (range > maxRange) {
                maxRange = range;
                bucketToSplit = i;
            }
        }

        if (maxRange === 0) break;

        const bucket = buckets[bucketToSplit];
        const rRange = bucket.maxR - bucket.minR;
        const gRange = bucket.maxG - bucket.minG;
        const bRange = bucket.maxB - bucket.minB;

        let sortKey;
        if (rRange >= gRange && rRange >= bRange) {
            sortKey = 'r';
        } else if (gRange >= bRange) {
            sortKey = 'g';
        } else {
            sortKey = 'b';
        }

        bucket.pixels.sort((a, b) => a[sortKey] - b[sortKey]);
        const median = Math.floor(bucket.pixels.length / 2);
        
        const pixels1 = bucket.pixels.slice(0, median);
        const pixels2 = bucket.pixels.slice(median);

        if (pixels1.length === 0 || pixels2.length === 0) break;

        const bucket1 = createBucket(pixels1);
        const bucket2 = createBucket(pixels2);

        buckets.splice(bucketToSplit, 1, bucket1, bucket2);
    }

    const result = {};
    buckets.forEach(bucket => {
        const avgR = Math.round(bucket.pixels.reduce((sum, p) => sum + p.r, 0) / bucket.pixels.length);
        const avgG = Math.round(bucket.pixels.reduce((sum, p) => sum + p.g, 0) / bucket.pixels.length);
        const avgB = Math.round(bucket.pixels.reduce((sum, p) => sum + p.b, 0) / bucket.pixels.length);
        
        const hex = '#' + [avgR, avgG, avgB].map(x => x.toString(16).padStart(2, '0')).join('');
        result[hex] = bucket.pixels.length;
    });

    return result;
}

function createBucket(pixels) {
    return {
        pixels: pixels,
        minR: Math.min(...pixels.map(p => p.r)),
        maxR: Math.max(...pixels.map(p => p.r)),
        minG: Math.min(...pixels.map(p => p.g)),
        maxG: Math.max(...pixels.map(p => p.g)),
        minB: Math.min(...pixels.map(p => p.b)),
        maxB: Math.max(...pixels.map(p => p.b))
    };
}

function drawColorSwatch(colorCounts) {
    const colorSwatches = document.getElementById('color-swatches');
    colorSwatches.innerHTML = '';

    const sortBy = sortSelect.value;
    const sortedEntries = Object.entries(colorCounts).sort((a, b) => {
        switch(sortBy) {
            case 'count-desc':
                return b[1] - a[1];
            case 'count-asc':
                return a[1] - b[1];
            case 'brightness':
                return chroma(b[0]).luminance() - chroma(a[0]).luminance();
            case 'hue':
                const hueA = chroma(a[0]).hsl()[0] || 0;
                const hueB = chroma(b[0]).hsl()[0] || 0;
                return hueA - hueB;
            default:
                return b[1] - a[1];
        }
    });

    const totalPixels = Object.values(colorCounts).reduce((a, b) => a + b, 0);

    sortedEntries.forEach(([color, count]) => {
        const container = document.createElement("section");
        const swatch = document.createElement("div");
        const colorInfo = document.createElement("div");

        container.classList.add("color-swatch-container");

        swatch.classList.add("color-swatch");
        swatch.style.backgroundColor = color;
        swatch.title = `Click to copy: ${color.toUpperCase()}`;

        const percentage = ((count / totalPixels) * 100).toFixed(2);
        colorInfo.classList.add("color-info");
        colorInfo.innerHTML = `
            <div><strong>${color.toUpperCase()}</strong></div>
            <div>${count.toLocaleString()} px (${percentage}%)</div>
        `;

        swatch.addEventListener('click', () => {
            navigator.clipboard.writeText(color.toUpperCase()).then(() => {
                swatch.style.transform = 'scale(1.1)';
                swatch.style.boxShadow = '0 0 10px ' + color;
                setTimeout(() => {
                    swatch.style.transform = 'scale(1)';
                    swatch.style.boxShadow = '';
                }, 300);
            }).catch(() => {
                console.log('Copied:', color.toUpperCase());
            });
        });

        container.appendChild(swatch);
        container.appendChild(colorInfo);
        colorSwatches.appendChild(container);
    });
    
    const pixelCountContainer = document.getElementById('pixel-count-container');
    pixelCountContainer.classList.remove('invisible');
}

function exportCSV() {
    if (!currentColorCounts) return;

    const sortBy = sortSelect.value;
    const sortedEntries = Object.entries(currentColorCounts).sort((a, b) => {
        switch(sortBy) {
            case 'count-desc': return b[1] - a[1];
            case 'count-asc': return a[1] - b[1];
            case 'brightness': return chroma(b[0]).luminance() - chroma(a[0]).luminance();
            case 'hue':
                const hueA = chroma(a[0]).hsl()[0] || 0;
                const hueB = chroma(b[0]).hsl()[0] || 0;
                return hueA - hueB;
            default: return b[1] - a[1];
        }
    });

    const totalPixels = Object.values(currentColorCounts).reduce((a, b) => a + b, 0);
    
    let csv = 'Color,Hex,R,G,B,Pixel Count,Percentage\n';
    
    sortedEntries.forEach(([color, count], index) => {
        const rgb = chroma(color).rgb();
        const percentage = ((count / totalPixels) * 100).toFixed(2);
        csv += `Color${index + 1},${color},${rgb[0]},${rgb[1]},${rgb[2]},${count},${percentage}%\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentFileName.replace(/\.[^/.]+$/, '')}_colors.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

function exportJSON() {
    if (!currentColorCounts) return;

    const sortBy = sortSelect.value;
    const sortedEntries = Object.entries(currentColorCounts).sort((a, b) => {
        switch(sortBy) {
            case 'count-desc': return b[1] - a[1];
            case 'count-asc': return a[1] - b[1];
            case 'brightness': return chroma(b[0]).luminance() - chroma(a[0]).luminance();
            case 'hue':
                const hueA = chroma(a[0]).hsl()[0] || 0;
                const hueB = chroma(b[0]).hsl()[0] || 0;
                return hueA - hueB;
            default: return b[1] - a[1];
        }
    });

    const totalPixels = Object.values(currentColorCounts).reduce((a, b) => a + b, 0);
    
    const data = {
        image: currentFileName,
        totalPixels,
        totalColors: Object.keys(currentColorCounts).length,
        quantizationMethod: 'Median Cut',
        maxColors: parseInt(maxColorsSlider.value),
        sortBy: sortSelect.value,
        colors: sortedEntries.map(([color, count], index) => {
            const rgb = chroma(color).rgb();
            const hsl = chroma(color).hsl();
            return {
                name: `Color${index + 1}`,
                hex: color,
                rgb: { r: rgb[0], g: rgb[1], b: rgb[2] },
                hsl: { h: hsl[0] || 0, s: hsl[1], l: hsl[2] },
                pixelCount: count,
                percentage: parseFloat(((count / totalPixels) * 100).toFixed(2))
            };
        })
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentFileName.replace(/\.[^/.]+$/, '')}_colors.json`;
    a.click();
    URL.revokeObjectURL(url);
}

function exportPalette() {
    if (!currentColorCounts) return;

    const colors = Object.keys(currentColorCounts);
    const cols = Math.ceil(Math.sqrt(colors.length));
    const rows = Math.ceil(colors.length / cols);
    const swatchSize = 64;
    
    const canvas = document.createElement('canvas');
    canvas.width = cols * swatchSize;
    canvas.height = rows * swatchSize;
    const ctx = canvas.getContext('2d');
    
    colors.forEach((color, index) => {
        const x = (index % cols) * swatchSize;
        const y = Math.floor(index / cols) * swatchSize;
        
        ctx.fillStyle = color;
        ctx.fillRect(x, y, swatchSize, swatchSize);
    });

    canvas.toBlob(blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${currentFileName.replace(/\.[^/.]+$/, '')}_palette.png`;
        a.click();
        URL.revokeObjectURL(url);
    });
}

function showWaitIndicator() {
    const waitIndicator = document.getElementById("wait-indicator");
    waitIndicator.classList.remove("invisible");
    waitIndicator.classList.add("fadein");
}

function hideWaitIndicator() {
    const waitIndicator = document.getElementById("wait-indicator");
    waitIndicator.classList.add("invisible");
    waitIndicator.classList.remove("fadein");
}

function reset() {
    const pixelCountContainer = document.getElementById('pixel-count-container');
    pixelCountContainer.classList.add('invisible');

    const colorSwatches = document.getElementById('color-swatches');
    colorSwatches.innerHTML = '';
    
    const uploadContainer = document.getElementById('upload-container');
    const existingImage = uploadContainer.querySelector('img:not([src*="spinner"])');
    if (existingImage) {
        uploadContainer.removeChild(existingImage);
    }

    const canvas = document.getElementById('canvas');
    const context = canvas.getContext('2d');  
    context.clearRect(0, 0, canvas.width, canvas.height);
    
    currentImageData = null;
    currentColorCounts = null;
}
