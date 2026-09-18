const profile = document.getElementById("dog-profile");
const dogId = new URLSearchParams(window.location.search).get("id");

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function renderDog(dog) {
  document.title = `${dog.name} — NorSled Dog Profile`;
  profile.textContent = "";

  const hero = element("div", "profile-hero");
  const image = element("img", "profile-photo");
  image.src = dog.image;
  image.alt = `${dog.name}, an adoptable ${dog.breed}`;
  hero.appendChild(image);

  const details = element("div", "profile-details");
  details.appendChild(element("p", "eyebrow", "Available dog profile"));
  details.appendChild(element("h1", "", dog.name));
  details.appendChild(element("p", "dog-meta", `${dog.age} • ${dog.weight} lb • ${dog.gender} • ${dog.breed}`));
  details.appendChild(element("p", "profile-summary", dog.description));

  const traits = element("ul", "trait-list");
  dog.traits.forEach((trait) => traits.appendChild(element("li", "", trait)));
  details.appendChild(traits);

  const actions = element("div", "profile-actions");
  const back = element("a", "secondary-link", "← Back to matches");
  back.href = new URLSearchParams(window.location.search).get("from") === "matches"
    ? "/match.html#results"
    : "/match.html";
  const norsled = element("a", "profile-link", "View all available dogs on NorSled ↗");
  norsled.href = "https://www.norsled.org/adoption-process-copy";
  norsled.target = "_blank";
  norsled.rel = "noopener";
  actions.append(back, norsled);
  details.appendChild(actions);
  hero.appendChild(details);
  profile.appendChild(hero);
}

fetch("/adoption-dogs.json", { cache: "no-store" })
  .then((response) => {
    if (!response.ok) throw new Error("Could not load dog profiles.");
    return response.json();
  })
  .then((dogs) => {
    const dog = dogs.find((item) => String(item.id) === dogId);
    if (!dog) throw new Error("Dog profile not found.");
    renderDog(dog);
  })
  .catch(() => {
    profile.innerHTML = '<div class="profile-status"><h2>Profile unavailable</h2><p>This dog may no longer be in the current profile list.</p><a class="secondary-link" href="/match.html">Back to matches</a></div>';
  });
