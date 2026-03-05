import requests
from bs4 import BeautifulSoup
import json

def search_google(query):
    # This is a fallback-style scraper since Brave is down.
    # Note: Google might block this if overused, but for a one-off it's okay.
    url = f"https://www.google.com/search?q={query.replace(' ', '+')}"
    headers = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"}
    response = requests.get(url, headers=headers)
    soup = BeautifulSoup(response.text, 'html.parser')
    results = []
    for g in soup.find_all('div', class_='tF2Cxc'):
        title = g.find('h3').text if g.find('h3') else ""
        link = g.find('a')['href'] if g.find('a') else ""
        snippet = g.find('div', class_='VwiC3b').text if g.find('div', class_='VwiC3b') else ""
        results.append({"title": title, "link": link, "snippet": snippet})
    return results

queries = [
    "medical school admissions resume grit vs prestige",
    "law school admissions resume metrics and impact",
    "how specialized graduate schools value undergraduate research and volunteerism"
]

all_data = {}
for q in queries:
    all_data[q] = search_google(q)

print(json.dumps(all_data, indent=2))
