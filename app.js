import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { 
  getFirestore, doc, setDoc, getDoc, deleteDoc, collection, getDocs 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// -------------------------------------------------------------
// [인증키 및 설정 대입] ⚠️ 본인의 실제 키로 교체하세요!
// -------------------------------------------------------------
const TOUR_API_KEY = "b2d8f3d6a6dd0e285169d5ad17955894fbbc64c9aabbcfb3f97529b7525159b2"; // 공공데이터 Decoding 키

const firebaseConfig = {
  apiKey: "AIzaSyB7ukzoSVaZCKyOu-80tcLY5Ytj0HOAV98",
  authDomain: "myproject-f7602.firebaseapp.com",
  projectId: "myproject-f7602",
  storageBucket: "myproject-f7602.firebasestorage.app",
  messagingSenderId: "390429847272",
  appId: "1:390429847272:web:1facbec7bd17fcc2c9235d"
};


// Firebase & Firestore 초기화
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// DOM 엘리먼트
const areaSelect = document.getElementById("areaSelect");
const tourGrid = document.getElementById("tourGrid");
const loading = document.getElementById("loading");
const statusInfo = document.getElementById("statusInfo");

const tabMainBtn = document.getElementById("tabMainBtn");
const tabFavBtn = document.getElementById("tabFavBtn");
const mainSection = document.getElementById("mainSection");
const favSection = document.getElementById("favSection");
const favGrid = document.getElementById("favGrid");
const favEmptyMsg = document.getElementById("favEmptyMsg");
const favCountEl = document.getElementById("favCount");

let currentItems = [];

// -------------------------------------------------------------
// 1. 초기 로드 시 Firestore 정보 확인
// -------------------------------------------------------------
window.addEventListener("DOMContentLoaded", async () => {
  updateFavBadgeCount();
  try {
    const docRef = doc(db, "userSelection", "current");
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      const { areaCode, areaName } = docSnap.data();
      if (areaCode) {
        areaSelect.value = areaCode;
        statusInfo.textContent = `Firestore에서 이전 저장 지역 [${areaName}] 정보를 불러왔습니다.`;
        await fetchAndRenderTourData(areaCode, areaName);
      }
    } else {
      tourGrid.classList.add("hidden");
      statusInfo.textContent = "저장된 지역 정보가 없습니다. 지역을 선택해주세요.";
    }
  } catch (err) {
    console.error("Firestore 초기 읽기 에러:", err);
    tourGrid.classList.add("hidden");
  }
});

// -------------------------------------------------------------
// 2. 지역 선택 시 API 호출 & Firestore 저장
// -------------------------------------------------------------
areaSelect.addEventListener("change", async (e) => {
  const areaCode = e.target.value;
  const areaName = e.target.options[e.target.selectedIndex].text;

  if (!areaCode) {
    tourGrid.classList.add("hidden");
    statusInfo.textContent = "";
    return;
  }

  await fetchAndRenderTourData(areaCode, areaName);

  // Firestore에 최근 선택한 지역 업데이트
  try {
    await setDoc(doc(db, "userSelection", "current"), {
      areaCode,
      areaName,
      updatedAt: new Date().toISOString()
    });
  } catch (err) {
    console.error("Firestore 저장 에러:", err);
  }
});

// -------------------------------------------------------------
// 3. 한국관광공사 TourAPI 2.0 (KorService2/areaBasedList2) 호출
// -------------------------------------------------------------
async function fetchAndRenderTourData(areaCode, areaName) {
  showLoading(true);
  tourGrid.innerHTML = "";

  const url = `https://apis.data.go.kr/B551011/KorService2/areaBasedList2?serviceKey=${encodeURIComponent(TOUR_API_KEY)}&numOfRows=20&pageNo=1&MobileOS=ETC&MobileApp=AppTest&_type=json&arrange=A&areaCode=${areaCode}`;

  try {
    const res = await fetch(url);
    const data = await res.json();
    let items = data.response?.body?.items?.item || [];

    if (!Array.isArray(items)) items = [items];

    if (items.length === 0) {
      statusInfo.textContent = `[${areaName}] 지역의 데이터가 없습니다.`;
      tourGrid.classList.add("hidden");
      return;
    }

    currentItems = items;
    statusInfo.textContent = `현재 지역: ${areaName} (총 ${items.length}건)`;
    await renderCards();
  } catch (error) {
    console.error("API 연동 에러:", error);
    statusInfo.textContent = "관광 정보를 불러오는 중 오류가 발생했습니다.";
    tourGrid.classList.add("hidden");
  } finally {
    showLoading(false);
  }
}

// -------------------------------------------------------------
// 4. 탐색기 시각화 카드 목록 렌더링 & 찜하기/취소 연동
// -------------------------------------------------------------
async function renderCards() {
  const favMap = await getFavoritesMap();
  tourGrid.innerHTML = "";

  currentItems.forEach((item) => {
    let imageUrl = item.firstimage || "https://via.placeholder.com/400x260?text=No+Image";
    if (imageUrl.startsWith("http://")) imageUrl = imageUrl.replace("http://", "https://");

    const contentId = String(item.contentid);
    const isFav = !!favMap[contentId];

    const card = document.createElement("article");
    card.className = "tour-card";
    card.innerHTML = `
      <div class="card-img-wrap">
        <img src="${imageUrl}" alt="${item.title}" loading="lazy" onError="this.src='https://via.placeholder.com/400x260?text=Image+Error'" />
        <button class="fav-btn" data-id="${contentId}">${isFav ? "❤️" : "🤍"}</button>
      </div>
      <div class="info">
        <div class="title">${item.title}</div>
        <div class="address">📍 ${item.addr1 || "주소 미제공"}</div>
      </div>
    `;

    // 찜하기 버튼 토글
    card.querySelector(".fav-btn").addEventListener("click", async (e) => {
      const isAdded = await toggleFavorite(item);
      e.target.textContent = isAdded ? "❤️" : "🤍";
      updateFavBadgeCount();
    });

    tourGrid.appendChild(card);
  });

  tourGrid.classList.remove("hidden");
}

// -------------------------------------------------------------
// 5. Firestore 찜 기능 관련 함수 (CRUD)
// -------------------------------------------------------------
async function getFavoritesMap() {
  try {
    const favSnap = await getDocs(collection(db, "favorites"));
    const favoritesMap = {};
    favSnap.forEach((docSnap) => {
      favoritesMap[docSnap.id] = docSnap.data();
    });
    return favoritesMap;
  } catch (err) {
    console.error("찜 목록 로드 실패:", err);
    return {};
  }
}

async function toggleFavorite(item) {
  const contentId = String(item.contentid);
  const favDocRef = doc(db, "favorites", contentId);
  const snap = await getDoc(favDocRef);

  if (snap.exists()) {
    await deleteDoc(favDocRef); // 이미 존재하면 삭제
    return false;
  } else {
    await setDoc(favDocRef, {  // 없으면 Firestore에 찜 저장
      contentid: item.contentid,
      title: item.title,
      addr1: item.addr1 || "",
      firstimage: item.firstimage || "",
      savedAt: new Date().toISOString()
    });
    return true;
  }
}

async function updateFavBadgeCount() {
  const favMap = await getFavoritesMap();
  favCountEl.textContent = Object.keys(favMap).length;
}

// -------------------------------------------------------------
// 6. 찜 보관함 화면 렌더링
// -------------------------------------------------------------
async function renderFavoritesView() {
  favGrid.innerHTML = "";
  const favMap = await getFavoritesMap();
  const items = Object.values(favMap);

  if (items.length === 0) {
    favEmptyMsg.classList.remove("hidden");
    return;
  }
  favEmptyMsg.classList.add("hidden");

  items.forEach((item) => {
    let imageUrl = item.firstimage || "https://via.placeholder.com/400x260?text=No+Image";
    if (imageUrl.startsWith("http://")) imageUrl = imageUrl.replace("http://", "https://");

    const card = document.createElement("article");
    card.className = "tour-card";
    card.innerHTML = `
      <div class="card-img-wrap">
        <img src="${imageUrl}" alt="${item.title}" />
        <button class="fav-btn" data-id="${item.contentid}">🗑️</button>
      </div>
      <div class="info">
        <div class="title">${item.title}</div>
        <div class="address">📍 ${item.addr1 || "주소 미제공"}</div>
      </div>
    `;

    // 찜 보관함에서 삭제 처리
    card.querySelector(".fav-btn").addEventListener("click", async () => {
      await toggleFavorite(item);
      updateFavBadgeCount();
      renderFavoritesView(); // 삭제 후 보관함 목록 재갱신
    });

    favGrid.appendChild(card);
  });
}

// -------------------------------------------------------------
// 7. 탭 전환 이벤트
// -------------------------------------------------------------
tabMainBtn.addEventListener("click", () => {
  tabMainBtn.classList.add("active");
  tabFavBtn.classList.remove("active");
  mainSection.classList.remove("hidden");
  favSection.classList.add("hidden");

  // 메인 탐색기의 찜 버튼 상태 최신화
  if (currentItems.length > 0) renderCards();
});

tabFavBtn.addEventListener("click", () => {
  tabFavBtn.classList.add("active");
  tabMainBtn.classList.remove("active");
  favSection.classList.remove("hidden");
  mainSection.classList.add("hidden");

  // 보관함 목록 보기 렌더링
  renderFavoritesView();
});

function showLoading(bool) {
  loading.classList.toggle("hidden", !bool);
}
