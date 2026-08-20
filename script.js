let photos = [];
const timelineYears = ['2022', '2023', '2024', '2025', '2026', '2027'];
const monthConfig = [
    { value: '01', short: 'Jan', long: 'January' },
    { value: '02', short: 'Feb', long: 'February' },
    { value: '03', short: 'Mar', long: 'March' },
    { value: '04', short: 'Apr', long: 'April' },
    { value: '05', short: 'May', long: 'May' },
    { value: '06', short: 'Jun', long: 'June' },
    { value: '07', short: 'Jul', long: 'July' },
    { value: '08', short: 'Aug', long: 'August' },
    { value: '09', short: 'Sep', long: 'September' },
    { value: '10', short: 'Oct', long: 'October' },
    { value: '11', short: 'Nov', long: 'November' },
    { value: '12', short: 'Dec', long: 'December' }
];

const yearPageState = {
    year: '',
    selectedMonth: '',
    page: 1,
    pageSize: 24
};

let lightboxInitialized = false;

function normalizePath(pathValue) {
    return String(pathValue || '').replace(/\\/g, '/').trim();
}

function resolveImagePath(category, item) {
    if (item.path) {
        return normalizePath(item.path);
    }
    if (item.filename) {
        return `images/${category}/${item.filename}`;
    }
    return '';
}

function flattenPhotoData(data) {
    const output = [];

    Object.keys(data).forEach(category => {
        if (!Array.isArray(data[category])) {
            return;
        }

        data[category].forEach(item => {
            const path = resolveImagePath(category, item);
            if (!path) {
                return;
            }

            output.push({
                category,
                path,
                thumbPath: normalizePath(item.thumbPath || ''),
                description: item.description || 'No description available.',
                showOnIndex: Boolean(item.showOnIndex)
            });
        });
    });

    return output;
}

function getDisplayPath(photo) {
    if (photo.thumbPath) {
        return photo.thumbPath;
    }
    return photo.path;
}

function createPhotoCard(photo) {
    const figure = document.createElement('figure');
    figure.className = 'photo-card';

    const image = document.createElement('img');
    image.className = 'lightbox-img';
    image.src = getDisplayPath(photo);
    image.alt = photo.description;
    image.setAttribute('data-src', photo.path);
    image.setAttribute('data-description', photo.description);
    image.loading = 'lazy';
    image.decoding = 'async';

    const caption = document.createElement('figcaption');
    caption.textContent = photo.description;

    figure.appendChild(image);
    figure.appendChild(caption);
    return figure;
}

function getYearFromPath(pathValue) {
    const match = normalizePath(pathValue).match(/images\/(\d{4})\//);
    return match ? match[1] : '';
}

function getMonthFromPath(pathValue) {
    const match = normalizePath(pathValue).match(/images\/\d{4}\/(\d{2})\//);
    return match ? match[1] : '';
}

function getMonthLabel(monthValue, mode = 'short') {
    const month = monthConfig.find(entry => entry.value === monthValue);
    if (!month) {
        return monthValue;
    }
    return mode === 'long' ? month.long : month.short;
}

function getTimelineCoverByYear() {
    const covers = {};
    photos.forEach(photo => {
        const year = getYearFromPath(photo.path);
        if (!year || covers[year]) {
            return;
        }
        covers[year] = photo;
    });
    return covers;
}

function renderTimeline() {
    const timelineTrack = document.getElementById('timeline-track');
    if (!timelineTrack) {
        return;
    }

    const coversByYear = getTimelineCoverByYear();
    timelineTrack.innerHTML = '';

    timelineYears.forEach(year => {
        const anchor = document.createElement('a');
        anchor.className = 'timeline-node';
        anchor.href = `${year}.html`;
        anchor.setAttribute('aria-label', `Open year ${year}`);

        const bubble = document.createElement('div');
        bubble.className = 'timeline-bubble';

        const cover = coversByYear[year];
        if (cover) {
            const bubbleImage = document.createElement('img');
            bubbleImage.src = getDisplayPath(cover);
            bubbleImage.alt = `Preview for year ${year}`;
            bubbleImage.loading = 'lazy';
            bubbleImage.decoding = 'async';
            bubble.appendChild(bubbleImage);
        } else {
            const bubbleText = document.createElement('span');
            bubbleText.textContent = 'Coming soon';
            bubble.appendChild(bubbleText);
        }

        const circle = document.createElement('div');
        circle.className = 'timeline-circle';
        circle.textContent = year;

        anchor.appendChild(bubble);
        anchor.appendChild(circle);
        timelineTrack.appendChild(anchor);
    });
}

function renderGalleries() {
    const featuredGallery = document.getElementById('featured-gallery');
    const allGallery = document.getElementById('all-gallery');

    if (!featuredGallery || !allGallery) {
        return;
    }

    featuredGallery.innerHTML = '';
    allGallery.innerHTML = '';

    const featured = photos.filter(photo => photo.showOnIndex);
    const featuredSet = new Set(featured.map(photo => photo.path));

    featured.forEach(photo => {
        featuredGallery.appendChild(createPhotoCard(photo));
    });

    photos.forEach(photo => {
        if (featuredSet.has(photo.path)) {
            return;
        }
        allGallery.appendChild(createPhotoCard(photo));
    });
}

function renderYearPage() {
    const yearValue = document.body.getAttribute('data-year-page');
    if (!yearValue) {
        return;
    }

    const yearTitle = document.getElementById('year-title');
    const yearGallery = document.getElementById('year-gallery');
    const emptyState = document.getElementById('year-empty');
    const sectionBlock = yearGallery ? yearGallery.closest('.section-block') : null;

    if (!yearGallery || !sectionBlock) {
        return;
    }

    const yearPhotos = photos.filter(photo => getYearFromPath(photo.path) === yearValue);

    if (yearPageState.year !== yearValue) {
        yearPageState.year = yearValue;
        yearPageState.selectedMonth = '';
        yearPageState.page = 1;
    }

    const monthCounts = {};
    monthConfig.forEach(month => {
        monthCounts[month.value] = 0;
    });

    yearPhotos.forEach(photo => {
        const monthValue = getMonthFromPath(photo.path);
        if (monthCounts[monthValue] !== undefined) {
            monthCounts[monthValue] += 1;
        }
    });

    const availableMonths = monthConfig.filter(month => monthCounts[month.value] > 0);

    if (availableMonths.length > 0) {
        const selectedExists = availableMonths.some(month => month.value === yearPageState.selectedMonth);
        if (!selectedExists) {
            yearPageState.selectedMonth = availableMonths[0].value;
            yearPageState.page = 1;
        }
    } else {
        yearPageState.selectedMonth = '';
        yearPageState.page = 1;
    }

    let controls = document.getElementById('year-controls');
    if (!controls) {
        controls = document.createElement('div');
        controls.id = 'year-controls';
        controls.className = 'year-controls';
        sectionBlock.insertBefore(controls, yearGallery);
    }

    controls.innerHTML = '';

    const monthTimeline = document.createElement('div');
    monthTimeline.className = 'month-timeline';

    const createMonthNode = (value, label, count) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'month-node';
        button.textContent = label;
        button.title = `${label}: ${count} photo${count === 1 ? '' : 's'}`;
        button.setAttribute('aria-label', `${label}: ${count} photo${count === 1 ? '' : 's'}`);
        if (yearPageState.selectedMonth === value) {
            button.classList.add('active');
        }
        button.addEventListener('click', () => {
            yearPageState.selectedMonth = value;
            yearPageState.page = 1;
            renderYearPage();
        });
        return button;
    };

    availableMonths.forEach(month => {
        monthTimeline.appendChild(
            createMonthNode(month.value, getMonthLabel(month.value, 'short'), monthCounts[month.value])
        );
    });

    controls.appendChild(monthTimeline);

    const filteredPhotos = yearPageState.selectedMonth
        ? yearPhotos.filter(photo => getMonthFromPath(photo.path) === yearPageState.selectedMonth)
        : [];

    const visibleCount = yearPageState.page * yearPageState.pageSize;
    const visiblePhotos = filteredPhotos.slice(0, visibleCount);

    if (yearTitle) {
        if (yearPageState.selectedMonth) {
            yearTitle.textContent = `${getMonthLabel(yearPageState.selectedMonth, 'long')} ${yearValue}`;
        } else {
            yearTitle.textContent = `${yearValue} Gallery`;
        }
    }

    yearGallery.innerHTML = '';
    visiblePhotos.forEach(photo => {
        yearGallery.appendChild(createPhotoCard(photo));
    });

    if (emptyState) {
        if (!yearPhotos.length) {
            emptyState.textContent = 'No photos added for this year yet.';
            emptyState.style.display = 'block';
        } else if (!filteredPhotos.length) {
            emptyState.textContent = 'No photos in this month yet.';
            emptyState.style.display = 'block';
        } else {
            emptyState.style.display = 'none';
        }
    }

    let loadMoreWrap = document.getElementById('year-load-more-wrap');
    if (!loadMoreWrap) {
        loadMoreWrap = document.createElement('div');
        loadMoreWrap.id = 'year-load-more-wrap';
        loadMoreWrap.className = 'load-more-wrap';
        sectionBlock.appendChild(loadMoreWrap);
    }

    loadMoreWrap.innerHTML = '';
    if (filteredPhotos.length > visiblePhotos.length) {
        const loadMoreBtn = document.createElement('button');
        loadMoreBtn.type = 'button';
        loadMoreBtn.className = 'load-more-btn';
        loadMoreBtn.textContent = 'Load More';
        loadMoreBtn.addEventListener('click', () => {
            yearPageState.page += 1;
            renderYearPage();
        });
        loadMoreWrap.appendChild(loadMoreBtn);
    }
}

function renderYearReflectionFooter() {
    const yearValue = document.body.getAttribute('data-year-page');
    if (!yearValue) {
        return;
    }

    const footer = document.querySelector('footer');
    if (!footer) {
        return;
    }

    const existing = document.getElementById('year-reflection');
    if (existing) {
        return;
    }

    const reflection = document.createElement('section');
    reflection.id = 'year-reflection';
    reflection.className = 'year-reflection';

    const title = document.createElement('h3');
    title.textContent = `${yearValue} Reflections`;

    const yearNote = document.createElement('p');
    yearNote.className = 'year-note';
    yearNote.textContent = 'Reflection';
    yearNote.contentEditable = 'true';

    reflection.appendChild(title);
    reflection.appendChild(yearNote);

    footer.prepend(reflection);
}

function initializeLightbox() {
    const lightbox = document.getElementById('lightbox');
    const lightboxContent = document.getElementById('lightbox-content');
    const closeLightbox = document.querySelector('.lightbox .close');
    const photoLocation = document.getElementById('photo-location');

    if (!lightbox || !lightboxContent || !closeLightbox || lightboxInitialized) {
        return;
    }

    lightboxInitialized = true;

    document.addEventListener('click', event => {
        const target = event.target;
        if (!(target instanceof Element)) {
            return;
        }

        const image = target.closest('.lightbox-img');
        if (!image) {
            return;
        }

        const imageSrc = image.getAttribute('data-src') || image.getAttribute('src') || '';
        const description = image.getAttribute('data-description') || 'No description available.';

        lightbox.style.display = 'flex';
        lightboxContent.src = imageSrc;
        if (photoLocation) {
            photoLocation.textContent = description;
        }
    });

    closeLightbox.addEventListener('click', () => {
        lightbox.style.display = 'none';
    });

    lightbox.addEventListener('click', event => {
        if (event.target === lightbox) {
            lightbox.style.display = 'none';
        }
    });

    document.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            lightbox.style.display = 'none';
        }
    });
}

fetch('photos.json')
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        photos = flattenPhotoData(data);
        renderTimeline();
        renderGalleries();
        renderYearPage();
        renderYearReflectionFooter();
        initializeLightbox();
    })
    .catch(error => {
        console.error('Error loading photo data:', error);
    });

