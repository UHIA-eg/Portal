import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, getDocs, doc, deleteDoc, setDoc, updateDoc, query, orderBy, where, Timestamp, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
 const firebaseConfig = {
        apiKey: "AIzaSyDgiNw5Dt6EkiokRjznzGkfZvVuDN0APPk",
        authDomain: "uhia-attendancesystem.firebaseapp.com",
        projectId: "uhia-attendancesystem",
        storageBucket: "uhia-attendancesystem.firebasestorage.app",
        messagingSenderId: "104444545133",
        appId: "1:104444545133:web:f40607b93fb90a8f511764"
    };

    const app = initializeApp(firebaseConfig);
    const db = getFirestore(app);

    let map;
    let markersLayer = L.layerGroup();
    let allFacilities = [];
    let allAttendance = [];
    let allUsers = [];
    let currentShiftAttendance = []; // To track status for map colors
    let excelData = [];

    window.handleExcelUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (evt) => {
            const bstr = evt.target.result;
            const wb = XLSX.read(bstr, { type: 'binary' });
            const wsname = wb.SheetNames[0];
            const ws = wb.Sheets[wsname];
            const data = XLSX.utils.sheet_to_json(ws, { header: 1 });

            if (data.length < 2) {
                alert("الملف فارغ أو غير صحيح");
                return;
            }

            // Assume header is in first row, data from second row
            // Format: [gov, name, lat, long]
            excelData = data.slice(1).map(row => ({
                governorate: row[0],
                facilityName: row[1],
                lat: parseFloat(row[2]),
                lng: parseFloat(row[3])
            })).filter(row => row.governorate && row.facilityName && !isNaN(row.lat) && !isNaN(row.lng));

            renderExcelPreview();
        };
        reader.readAsBinaryString(file);
    };

    window.renderExcelPreview = function() {
        const previewBody = document.getElementById('excel-preview-body');
        previewBody.innerHTML = "";
        
        excelData.forEach(row => {
            previewBody.innerHTML += `<tr>
                <td>${row.governorate}</td>
                <td>${row.facilityName}</td>
                <td>${row.lat}</td>
                <td>${row.lng}</td>
            </tr>`;
        });

        document.getElementById('excel-preview-container').style.display = 'block';
        document.getElementById('upload-status').innerText = `تم تحميل ${excelData.length} منشأة. راجع البيانات ثم اضغط حفظ.`;
    }

    window.processExcelData = async () => {
        const btn = document.getElementById('confirm-upload-btn');
        btn.disabled = true;
        btn.innerText = "جاري الحفظ...";

        let successCount = 0;
        let errorCount = 0;

        for (const row of excelData) {
            try {
                const facID = `${row.governorate}-${row.facilityName}`.replace(/\s+/g, '_');
                await setDoc(doc(db, "FacilitiesReference", facID), {
                    facilityName: row.facilityName,
                    governorate: row.governorate,
                    lat: row.lat,
                    lng: row.lng,
                    lastUpdated: serverTimestamp()
                });
                successCount++;
            } catch (err) {
                console.error("Error adding facility:", err);
                errorCount++;
            }
        }

        document.getElementById('upload-status').innerText = `تم الحفظ بنجاح: ${successCount} | أخطاء: ${errorCount}`;
        btn.disabled = false;
        btn.innerText = "تأكيد الحفظ في قاعدة البيانات";
        
        if (successCount > 0) {
            refreshData();
            setTimeout(() => {
                document.getElementById('excel-preview-container').style.display = 'none';
                excelData = [];
            }, 3000);
        }
    };

    // Custom Icon Colors Logic
    window.createCustomIcon = function(color) {
        return new L.Icon({
            iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-${color}.png`,
            shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
            iconSize: [20, 30], // Smaller size requested
            iconAnchor: [10, 30],
            popupAnchor: [1, -34],
            shadowSize: [30, 30]
        });
    }

    // --- Clock & Date Logic ---
    window.updateClock = function() {
        const now = new Date();
        const timeStr = now.toLocaleTimeString('en-GB');
        const dateStr = now.toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        
        const clockEl = document.getElementById('digital-clock');
        const dateEl = document.getElementById('live-date');
        
        if(clockEl) clockEl.innerText = timeStr;
        if(dateEl) dateEl.innerText = dateStr;
    }
    setInterval(updateClock, 1000);
window.toggleSidebar = () => {
    const sidebar = document.querySelector('.sidebar');
    sidebar.classList.toggle('active');
};

// Also add this to close the sidebar if the user clicks the "Overlay" or a link
document.addEventListener('click', (e) => {
    const sidebar = document.querySelector('.sidebar');
    const toggleBtn = document.querySelector('.top-navbar button');
    
    // If clicking outside the sidebar and NOT on the toggle button
    if (sidebar.classList.contains('active') && 
        !sidebar.contains(e.target) && 
        !toggleBtn.contains(e.target)) {
        sidebar.classList.remove('active');
    }
});

    window.closeAll = () => {
        document.getElementById('sidebar').classList.remove('active');
        window.closeModal();
    };

    window.navTo = (section, event) => {
        const header = document.getElementById('first-page-header');
        header.style.display = (section === 'attendance') ? 'block' : 'none';

        document.querySelectorAll('.data-container').forEach(s => s.style.display = 'none');
        const target = document.getElementById(`sec-${section}`);
        if(target) target.style.display = 'block';
        
        document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
        event.currentTarget.classList.add('active');

        if(section === 'map-view') {
            setTimeout(() => { 
                map.invalidateSize();
                renderMapMarkers();
            }, 200);
        }

        if (section === 'flagged') {
            renderFlaggedSection();
            if (flaggedMap) {
                setTimeout(() => flaggedMap.invalidateSize(), 200);
            }
        }

        if(window.innerWidth <= 992) window.closeAll();
    };

    let flaggedMap;
    let flaggedMarkersLayer = L.layerGroup();

    window.renderFlaggedSection = () => {
        const table = document.getElementById('flagged-table');
        table.innerHTML = "";
        
        if (!flaggedMap) {
            flaggedMap = L.map('flagged-map').setView([26.8, 30.8], 6);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(flaggedMap);
            flaggedMarkersLayer.addTo(flaggedMap);
        } else {
            setTimeout(() => flaggedMap.invalidateSize(), 200);
        }

        flaggedMarkersLayer.clearLayers();

        const flaggedFacs = allFacilities.filter(f => f.flag === true);
        flaggedFacs.forEach((f, index) => {
            const creator = allUsers.find(u => u.facility === f.facilityName && u.governorate === f.governorate) 
                            || {fullName: 'غير معروف', nationalID: '-', phoneNumber: '-'};

            table.innerHTML += `<tr>
                <td>${index + 1}</td>
                <td><b>${f.facilityName}</b></td>
                <td>${f.governorate}</td>
                <td>${creator.fullName}</td>
                <td>${creator.phoneNumber}</td>
                <td><small>${f.lat.toFixed(4)}, ${f.lng.toFixed(4)}</small></td>
                <td>
                    <button class="btn-primary" style="background:var(--accent); margin-bottom:5px;" onclick="zoomToFlagged(${f.lat}, ${f.lng})">
                        <i class="material-icons" style="font-size:16px">visibility</i> معاينة
                    </button>
                    <button class="btn-add" style="background:var(--success); margin-bottom:5px;" onclick="openEditFlaggedModal('${f.id}')">
                        <i class="material-icons" style="font-size:16px">edit</i> مراجعة واعتماد
                    </button>
                    <button class="btn-delete" style="padding: 5px 10px; background: var(--danger); color:white; border:none; border-radius:5px; cursor:pointer;" onclick="deleteRecord('FacilitiesReference', '${f.id}')">
                        حذف
                    </button>
                </td>
            </tr>`;

            L.marker([f.lat, f.lng]).addTo(flaggedMarkersLayer)
                .bindPopup(`<b>${f.facilityName}</b><br>بواسطة: ${creator.fullName}`);
        });
    };

    window.openEditFlaggedModal = (id) => {
        const f = allFacilities.find(x => x.id === id);
        if(!f) return;
        document.getElementById('edit-flag-id').value = id;
        document.getElementById('edit-flag-name').value = f.facilityName;
        document.getElementById('edit-flag-lat').value = f.lat;
        document.getElementById('edit-flag-lng').value = f.lng;
        openModal('edit-flagged-modal');
    };

    window.approveFlagged = async () => {
        const id = document.getElementById('edit-flag-id').value;
        const name = document.getElementById('edit-flag-name').value;
        const lat = parseFloat(document.getElementById('edit-flag-lat').value);
        const lng = parseFloat(document.getElementById('edit-flag-lng').value);

        if(!name || isNaN(lat)) return alert("يرجى إكمال البيانات");

        try {
            await updateDoc(doc(db, "FacilitiesReference", id), {
                facilityName: name,
                lat: lat,
                lng: lng,
                flag: false, // Mark as approved
                approvedAt: serverTimestamp()
            });
            alert("تم اعتماد المنشأة بنجاح!");
            closeModal();
            refreshData();
        } catch (e) { alert("خطأ: " + e.message); }
    };

    window.zoomToFlagged = (lat, lng) => {
        if (flaggedMap) flaggedMap.setView([lat, lng], 16);
    };

    // --- Core Logic ---

    window.onload = async () => {
        let user = JSON.parse(sessionStorage.getItem('userData'));
        if (!user || user.role !== 'admin') {
            window.location.href = "index.html";
            return;
        }

        const today = new Date().toISOString().split('T')[0];
        document.getElementById('dash-date-start').value = today;
        document.getElementById('dash-date-end').value = today;
        
        initMap();
        updateClock();
        await refreshData();
    };

window.refreshData = async function() {
    const startDateStr = document.getElementById('dash-date-start').value;
    const endDateStr = document.getElementById('dash-date-end').value;
    const selectedShift = document.getElementById('dash-shift-filter').value;

    if (!startDateStr || !endDateStr) return;

    const boundaryStart = new Date(startDateStr);
    boundaryStart.setHours(0, 0, 0, 0);
    
    const boundaryEnd = new Date(endDateStr);
    boundaryEnd.setHours(23, 59, 59, 999);

    try {
        // 1. Fetch Fresh Data
        const [attSnap, facSnap, userSnap] = await Promise.all([
            getDocs(collection(db, "AttendanceLogs")),
            getDocs(collection(db, "FacilitiesReference")),
            getDocs(collection(db, "UsersRegistry"))
        ]);

        allAttendance = attSnap.docs.map(d => ({id: d.id, ...d.data()}));
        allFacilities = facSnap.docs.map(d => ({id: d.id, ...d.data()}));
        allUsers = userSnap.docs.map(d => ({id: d.id, ...d.data()}));

        // 2. Filter Attendance by Date and Shift
        const filteredAtt = allAttendance.filter(log => {
            if(!log.loginTime) return false;
            const loginDate = log.loginTime instanceof Timestamp ? log.loginTime.toDate() : new Date(log.loginTime);
            const isInPeriod = (loginDate >= boundaryStart && loginDate <= boundaryEnd);
            if (!isInPeriod) return false;

            const hour = loginDate.getHours();
            const calcShift = (hour >= 8 && hour < 16) ? 'morning' : 'night';
            log.calculatedShift = calcShift; 

            if (selectedShift !== 'all' && selectedShift !== calcShift) return false;
            return true;
        });

        currentShiftAttendance = filteredAtt; 

        // 3. Calculate Counter Values
        const activeUsersInPeriod = filteredAtt.filter(log => !log.logoutTime);
        const usedFacNames = [...new Set(filteredAtt.map(log => log.facility))];
        const totalSystemUsers = allUsers.filter(u => u.role !== 'admin');

        // 4. Update Main Stat Numbers
        document.getElementById('stat-today').innerText = filteredAtt.length;
        document.getElementById('stat-active').innerText = activeUsersInPeriod.length;
        document.getElementById('stat-used-fac').innerText = usedFacNames.length;
        document.getElementById('stat-total-fac').innerText = allFacilities.length;
        document.getElementById('stat-users').innerText = totalSystemUsers.length;

        // 5. UPDATE HOVER LISTS (MUST BE INSIDE THE TRY BLOCK)
        

// 1. Total Attendance (Matches stat-today)
const attendanceUl = document.getElementById('details-attendance');
if (attendanceUl) {
    attendanceUl.innerHTML = filteredAtt.length > 0 
        ? filteredAtt.map((a, index) => `
            <li>
                <span class="row-id">${index + 1}</span>
                <div class="list-content">
                    <span class="user-name">${a.userName || a.fullName || 'غير معروف'}</span>
                    <span class="fac-name">${a.facility || 'منشأة غير معروفة'}</span>
                </div>
            </li>`).join('')
        : "<li>لا يوجد حضور</li>";
}

// 2. Active Now (Matches stat-active)
const activeUl = document.getElementById('details-active');
if (activeUl) {
    activeUl.innerHTML = activeUsersInPeriod.length > 0
        ? activeUsersInPeriod.map((u, index) => `
            <li>
                <span class="row-id">${index + 1}</span>
                <div class="list-content">
                    <span class="user-name">${u.userName || u.fullName || 'غير معروف'}</span>
                    <span class="fac-name">${u.facility}</span>
                </div>
            </li>`).join('')
        : "<li>لا يوجد نشط حالياً</li>";
}


// List 3: Used Facilities (Matches stat-used-fac)
const usedUl = document.getElementById('details-used-fac');
if (usedUl) {
    usedUl.innerHTML = usedFacNames.length > 0
        ? usedFacNames.map((name, index) => `
            <li>
                <span class="row-id">${index + 1}</span>
                <div class="list-content">
                    <span class="user-name">${name || 'غير معروف'}</span>
                </div>
            </li>`).join('')
        : "<li>لا توجد منشآت مستخدمة</li>";
}

// List 4: All Facilities (Matches stat-total-fac)
const facUl = document.getElementById('details-total-fac');
if (facUl) {
    facUl.innerHTML = allFacilities.length > 0
        ? allFacilities.map((f, index) => `
            <li>
                <span class="row-id">${index + 1}</span>
                <div class="list-content">
                    <span class="user-name">${f.facilityName || 'بدون اسم'}</span>
                    <span class="fac-name">${f.id.split('-')[0]}</span>
                </div>
            </li>`).join('')
        : "<li>قائمة المنشآت فارغة</li>";
}

// List 5: Total Users (Matches stat-users)
const usersUl = document.getElementById('details-users-list');
if (usersUl) {
    usersUl.innerHTML = totalSystemUsers.length > 0
        ? totalSystemUsers.map((u, index) => `
            <li>
                <span class="row-id">${index + 1}</span>
                <div class="list-content">
                    <span class="user-name">${u.fullName || u.userName || 'مستخدم غير معروف'}</span>
                    <span class="fac-name">${u.role || 'موظف'}</span>
                </div>
            </li>`).join('')
        : "<li>لا يوجد مستخدمين مسجلين</li>";
}

        // 6. Run standard table renders
        renderAttendanceTable(filteredAtt);
        renderUsersTable();
        renderFacilitiesTable(filteredAtt);
        renderMapMarkers();

        const flaggedSec = document.getElementById('sec-flagged');
        if (flaggedSec && flaggedSec.style.display !== 'none') {
            renderFlaggedSection();
        }

    } catch (err) {
        console.error("Data Fetch Error:", err);
        alert("حدث خطأ أثناء تحديث البيانات.");
    }
};

    window.renderAttendanceTable = function(data) {
        const table = document.getElementById('attendance-table');
        table.innerHTML = "";
        data.sort((a,b) => {
            const dateA = a.loginTime instanceof Timestamp ? a.loginTime.toDate() : new Date(a.loginTime);
            const dateB = b.loginTime instanceof Timestamp ? b.loginTime.toDate() : new Date(b.loginTime);
            return dateB - dateA;
        });

        data.forEach(log => {
            const loginDate = log.loginTime instanceof Timestamp ? log.loginTime.toDate() : new Date(log.loginTime);
            const logoutDate = log.logoutTime ? (log.logoutTime instanceof Timestamp ? log.logoutTime.toDate() : new Date(log.logoutTime)) : null;
            const shiftLabel = log.calculatedShift === 'morning' ? 
                '<span class="badge badge-info">صباحية</span>' : 
                '<span class="badge badge-warning">مسائية </span>';

            table.innerHTML += `<tr>
                <td><b>${log.fullName || 'غير معروف'}</b><br><small>${log.nationalID || '-'}</small></td>
                <td>${log.facility || '-'}</td>
                <td>${shiftLabel}</td>
                <td>${loginDate.toLocaleString('ar-EG')}<br>
                    <div style="margin-top:5px; cursor:pointer;" onclick="showImageModal('${log.loginPhoto}')">
                        <img src="${log.loginPhoto}" style="width:50px; height:50px; border-radius:5px; border:1px solid #ddd; object-fit:cover;">
                        <br><small style="color:var(--primary); text-decoration:underline;">تكبير</small>
                    </div>
                </td>
                <td>${logoutDate ? logoutDate.toLocaleString('ar-EG') : '<span class="badge badge-success">متواجد حالياً</span>'}<br>
                    ${log.logoutPhoto ? `
                    <div style="margin-top:5px; cursor:pointer;" onclick="showImageModal('${log.logoutPhoto}')">
                        <img src="${log.logoutPhoto}" style="width:50px; height:50px; border-radius:5px; border:1px solid #ddd; object-fit:cover;">
                        <br><small style="color:var(--danger); text-decoration:underline;">تكبير</small>
                    </div>` : ''}
                </td>
                <td>${log.workDuration || '-'}</td>
                <td><button class="btn-delete" style="padding: 5px 10px; background: var(--danger); color:white; border:none; border-radius:5px; cursor:pointer;" onclick="deleteRecord('AttendanceLogs', '${log.id}')">حذف</button></td>
            </tr>`;
        });
    }

    window.renderUsersTable = function() {
        const table = document.getElementById('users-table');
        table.innerHTML = "";
        
        allUsers.forEach(u => {
            if(u.role === 'admin') return;
            table.innerHTML += `<tr class="user-row" data-name="${u.fullName || ''}" data-id="${u.nationalID || u.id}" data-gov="${u.governorate || ''}" data-fac="${u.facility || ''}">
                <td><b>${u.fullName || '-'}</b></td>
                <td>${u.nationalID || u.id}</td>
                <td><code>${u.password || '-'}</code></td>
                <td>${u.governorate || '-'}</td> <td>${u.facility || '-'}</td>    <td>${u.phoneNumber || '-'}</td>
                <td>
                    <button class="btn-edit" style="padding: 5px 10px; background: var(--accent); color:white; border:none; border-radius:5px; cursor:pointer;" onclick="openEditUserModal('${u.id}', ${JSON.stringify(u).replace(/"/g, '&quot;')})">تعديل</button>
                    <button class="btn-delete" style="padding: 5px 10px; background: var(--danger); color:white; border:none; border-radius:5px; cursor:pointer;" onclick="deleteRecord('UsersRegistry', '${u.id}')">حذف</button>
                </td>
            </tr>`;
        });
    }

window.renderFacilitiesTable = function(filteredData) {
    const table = document.getElementById('facilities-table');
    table.innerHTML = "";

    allFacilities.forEach((f, index) => {
        // Validation based on both Name AND Governorate to handle duplicate names
        const assignedCount = allUsers.filter(u => 
            u.facility === f.facilityName && u.governorate === f.governorate
        ).length;

        const periodCount = filteredData.filter(log => 
            log.facility === f.facilityName && log.governorate === f.governorate
        ).length;

        const lat = f.lat || 0;
        const lng = f.lng || 0;

        table.innerHTML += `<tr class="fac-row" data-name="${f.facilityName}" data-gov="${f.governorate}">
            <td>${index + 1}</td> <td><b>${f.facilityName}</b></td>
            <td>${f.governorate}</td>
            <td style="text-align:center"><span class="badge" style="background:#f1f5f9">${assignedCount} موظف</span></td>
            <td style="text-align:center"><span class="badge badge-success">${periodCount} سجل</span></td>
            <td><small>${lat.toFixed(3)}, ${lng.toFixed(3)}</small></td>
            <td><button class="btn-delete" style="padding: 5px 10px; background: var(--danger); color:white; border:none; border-radius:5px; cursor:pointer;" onclick="deleteRecord('FacilitiesReference', '${f.id}')">حذف</button></td>
        </tr>`;
    });
}
    // --- Search & Filters ---

    window.filterUsers = () => {
        const nameQuery = document.getElementById('search-users-main').value.toLowerCase();
        const govQuery = document.getElementById('filter-user-gov').value;
        const facQuery = document.getElementById('search-user-fac').value.toLowerCase();

        document.querySelectorAll('.user-row').forEach(row => {
            const matchName = (row.dataset.name?.toLowerCase() || "").includes(nameQuery) || (row.dataset.id || "").includes(nameQuery);
            const matchGov = !govQuery || row.dataset.gov === govQuery;
            const matchFac = (row.dataset.fac?.toLowerCase() || "").includes(facQuery);
            row.style.display = (matchName && matchGov && matchFac) ? '' : 'none';
        });
    };

    window.filterFacilities = () => {
        const nameQuery = document.getElementById('search-fac-name').value.toLowerCase();
        const govQuery = document.getElementById('filter-fac-gov').value;

        document.querySelectorAll('.fac-row').forEach(row => {
            const matchName = row.dataset.name.toLowerCase().includes(nameQuery);
            const matchGov = !govQuery || row.dataset.gov === govQuery;
            row.style.display = (matchName && matchGov) ? '' : 'none';
        });
    };

    window.filterTable = (tableId, query) => {
        const q = query.toLowerCase();
        document.querySelectorAll(`#${tableId} tr`).forEach(row => {
            row.style.display = row.innerText.toLowerCase().includes(q) ? '' : 'none';
        });
    };

    // --- Map Logic (IMPROVED SEARCH & COLORS) ---

    window.initMap = function() {
        if(map) return;
        map = L.map('facilities-map').setView([26.8206, 30.8025], 6);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap'
        }).addTo(map);
        markersLayer.addTo(map);
    }

    window.renderMapMarkers = function() {
        markersLayer.clearLayers();
        const govFilter = document.getElementById('map-gov-filter').value;

        allFacilities.forEach(f => {
            // Apply Governorate Filter
            if (govFilter && f.governorate !== govFilter) return;

            if(f.lat && f.lng) {
                // Determine Color Logic: Has anyone logged in during the currently filtered shift/day?
                const hasLogin = currentShiftAttendance.some(log => log.facility === f.facilityName);
                const markerColor = hasLogin ? 'green' : 'red';
                const statusText = hasLogin ? '<span style="color:green">متاح (حضور نشط)</span>' : '<span style="color:red">غير متاح (لا يوجد حضور)</span>';

                const marker = L.marker([f.lat, f.lng], { icon: createCustomIcon(markerColor) })
                    .bindPopup(`<b>${f.facilityName}</b><br>${f.governorate}<br>${statusText}`);
                marker.facilityData = f;
                markersLayer.addLayer(marker);
            }
        });
    }

    window.searchOnMap = () => {
        const q = document.getElementById('map-search').value.toLowerCase();
        const resultBox = document.getElementById('map-search-results');
        resultBox.innerHTML = "";

        if (q.length < 1) {
            resultBox.style.display = "none";
            return;
        }

        const matches = allFacilities.filter(f => f.facilityName.toLowerCase().includes(q));

        if (matches.length > 0) {
            resultBox.style.display = "block";
            matches.forEach(f => {
                const div = document.createElement('div');
                div.className = "map-search-item";
                div.innerHTML = `<strong>${f.facilityName}</strong><br><small>${f.governorate}</small>`;
                div.onclick = () => {
                    map.setView([f.lat, f.lng], 15);
                    markersLayer.eachLayer(m => {
                        if(m.facilityData.facilityName === f.facilityName) m.openPopup();
                    });
                    resultBox.style.display = "none";
                };
                resultBox.appendChild(div);
            });
        } else {
            resultBox.style.display = "none";
        }
    };

    document.addEventListener('click', (e) => {
        if (e.target.id !== 'map-search') {
            const rb = document.getElementById('map-search-results');
            if(rb) rb.style.display = "none";
        }
    });

    // --- Global DB Operations ---

    window.deleteRecord = async (col, id) => {
        if(confirm("تحذير: هل أنت متأكد من حذف هذا السجل نهائيا؟")) {
            await deleteDoc(doc(db, col, id));
            refreshData();
        }
    };

    window.saveFacility = async () => {
        const name = document.getElementById('m-fac-name').value;
        const gov = document.getElementById('m-fac-gov').value;
        const lat = parseFloat(document.getElementById('m-fac-lat').value);
        const lng = parseFloat(document.getElementById('m-fac-lng').value);

        if(!name || !gov || isNaN(lat)) return alert("يرجى إكمال البيانات");

        const newId = "fac_" + Date.now();
        await setDoc(doc(db, "FacilitiesReference", newId), {
            facilityName: name,
            governorate: gov,
            lat: lat,
            lng: lng
        });
        closeModal();
        refreshData();
    };

    window.openEditUserModal = (id, data) => {
        document.getElementById('edit-u-id').value = id;
        document.getElementById('edit-u-name').value = data.fullName || '';
        document.getElementById('edit-u-ni').value = data.nationalID || '';
        document.getElementById('edit-u-pass').value = data.password || '';
        document.getElementById('edit-u-phone').value = data.phoneNumber || '';
        openModal('edit-user-modal');
    };

    window.updateUser = async () => {
        const id = document.getElementById('edit-u-id').value;
        await updateDoc(doc(db, "UsersRegistry", id), {
            fullName: document.getElementById('edit-u-name').value,
            nationalID: document.getElementById('edit-u-ni').value,
            password: document.getElementById('edit-u-pass').value,
            phoneNumber: document.getElementById('edit-u-phone').value
        });
        closeModal();
        refreshData();
    };

    window.showImageModal = (base64) => {
        const img = document.getElementById('modal-img-display');
        img.src = base64;
        openModal('image-modal');
    };

    window.openModal = (id) => {
        document.getElementById(id).style.display = 'block';
        document.getElementById('overlay').style.display = 'block';
    };

    window.closeModal = () => {
        document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
        document.getElementById('overlay').style.display = 'none';
    };

    window.logoutAdmin = () => {
        sessionStorage.clear();
        window.location.href = "index.html";
    };

    // Generic Export Function for any table
    window.exportTableToExcel = (tableId, filenamePrefix) => {
        const table = document.getElementById(tableId);
        const wb = XLSX.utils.table_to_book(table, { sheet: "Sheet1" });
        const dateStamp = new Date().toISOString().split('T')[0];
        XLSX.writeFile(wb, `UHIA_${filenamePrefix}_${dateStamp}.xlsx`);
    };
    document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM Loaded, starting Firebase fetch...");
    window.refreshData(); // Triggers your records fetch
});
