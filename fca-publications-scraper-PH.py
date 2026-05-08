import requests
from bs4 import BeautifulSoup
import re
from urllib.parse import urljoin
import json
from datetime import datetime
from datetime import date
import gspread
import pandas as pd
import os

# Converts mm/dd/yyyy to dd mm yyyy
def convert_mdy_to_ddmmyyy(string_date):
    # Original date string
    date_str = string_date

    # Convert string to datetime object
    date_obj = datetime.strptime(date_str, "%m/%d/%Y")

    # Format datetime object to desired string format
    formatted_date = date_obj.strftime("%d %B %Y")

    print(formatted_date)  # Output: 25 June 2025
    return formatted_date

# Converts dd/mm/yyyy to dd mm yyyy
def convert_dmy_to_ddmmyyy(string_date):
    # Original date string
    date_str = string_date

    # Convert string to datetime object
    date_obj = datetime.strptime(date_str, "%d/%m/%Y")

    # Format datetime object to desired string format
    formatted_date = date_obj.strftime("%d %B %Y")

    ###  print(formatted_date)  # Output: 25 June 2025
    return formatted_date


def scrape_taskforce_updates():
    
    # Set up headers to mimic a real browser request
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }
    
    try:

        # Target URL
        base_url = "https://www.fca.org.uk"
        search_url = ("https://www.fca.org.uk/publications/search-results?"
                    "p_search_term=&category=policy%20and%20guidance-policy%20statements%2C"
                    "policy%20and%20guidance-finalised%20guidance%2Cpolicy%20and%20guidance-consultation%20papers%2C"
                    "policy%20and%20guidance-guidance%20consultations%2Cpolicy%20and%20guidance-feedback%20statements%2C"
                    "policy%20and%20guidance-discussion%20papers%2Cpolicy%20and%20guidance-calls%20for%20input%2C"
                    "policy%20and%20guidance-newsletters%2Cpolicy%20and%20guidance-handbook&sort_by=dmetaZ")

        # Fetch the page
        response = requests.get(search_url)
        response.raise_for_status()  # Ensure the request was successful
        print("DEBUG: Status:" + str(response.status_code))

        soup = BeautifulSoup(response.text, 'html.parser')

        # Find article blocks (the actual selector may need adjustment)
        articles = soup.find_all('li', class_='search-item')[:5]
        #*** articles = soup.find_all('li', class_='search-item')[:5]
        print("DEBUG: got articles")
        print(f"DEBUG: Articles count:" + str(len(articles)))
        #*** print(articles)

        results = []

        for article in articles:
            # Title and link
            title_tag = article.find('a', class_='search-item__clickthrough')
            #****title_tag = article.find('a')
            print("DEBUG: getting title")
            title = title_tag.get_text(strip=True) if title_tag else 'N/A'
            link = urljoin(base_url, title_tag['href']) if title_tag and title_tag.has_attr('href') else 'N/A'
            
            # Label (e.g., PS25/6, FG25/2, etc.)
            label = article.find('p', class_='meta-item type')
            label = label.get_text(strip=True) if label else 'N/A'
            print("DEBUG: getting label")
            print(label)

            # Date
            date_tag = article.find('p', class_='meta-item published-date')
            date_string = date_tag.get_text(strip=True) if date_tag else 'N/A'
            date_string = date_string.strip("Published: ")
            date = convert_dmy_to_ddmmyyy(date_string)
            print("DEBUG: getting date")
            print(date)
            

            # Summary
            summary_tag = article.find('div', class_='search-item__body')
            summary = summary_tag.get_text(strip=True) if summary_tag else 'N/A'
            print("DEBUG: getting summary")
            print(summary)

            results.append({
                'title': title,
                'label': label,
                'date': date,
                'summary': summary,
                'link': link
            })


        for idx, item in enumerate(results, 1):
            print(f"Update {idx}:")
            print(f"Title: {item['title']}")
            print(f"Label: {item['label']}")
            print(f"Date: {item['date']}")
            print(f"Summary: {item['summary']}")
            print(f"Link: {item['link']}")
            print("-" * 60)


        return results[:5]
        
    except requests.RequestException as e:
        print(f"Error fetching the webpage: {e}")
        return []
    except Exception as e:
        print(f"Error parsing the content: {e}")
        return []


def write_to_google_sheets(updates, my_worksheet):
    
    # details for email updates
    emailRecipient = "akub3@hotmail.com"
    today = date.today()
    string_date = today.strftime("%B %d, %Y")
    emailSubject = "Horizon Scanning from " + string_date + ": Latest Regulatory Updates"

    # Path to your downloaded JSON credentials file
    SERVICE_ACCOUNT_FILE = '/Users/bukamulwila/Documents/Personal/Security/dtcc-cs-horizon-scanner-684a13b34b9a.json'
    print(f"Debug: Key for google sheets is: {SERVICE_ACCOUNT_FILE }")
    # Authenticate with Google Sheets
    gc = gspread.service_account(filename=SERVICE_ACCOUNT_FILE)
    print(f"Debug: Authenticated with google sheets")
    # Open the spreadsheet by its title (or by its key or URL)
    spreadsheet = gc.open('cs-horizon-scanner')
    print(f"Debug: Opened spreadsheet")

    # Select the worksheet (by title or by index)
    worksheet = spreadsheet.worksheet(my_worksheet)

    worksheet.clear()

    # Append email info to worksheet
    #*** emailRecipient_sheet_data = [[emailRecipient]]
    #*** worksheet.append_rows(emailRecipient_sheet_data)

    #*** emailSubject_sheet_data = [[emailSubject]]
    #*** worksheet.append_rows( emailSubject_sheet_data)

    # Define row headers
    scraped_data_headers = [
            ['Reg Area', 'Title', 'Label', 'Issue Date', 'Summary', 'Link']
        ]

    # Append the data to the worksheet
    # This will add the header data to the first empty row.
    worksheet.append_rows(scraped_data_headers)

    ### This will loop through the list and add the row data to the first empty row.
    for i, update in enumerate(updates, 1):
            scraped_data_row_elements = ["FCA Publications", update['title'], update['label'], 
                                         update['date'], update['summary'], update['link'] ]
            scraped_data_row = [scraped_data_row_elements]
            worksheet.append_rows(scraped_data_row)    

    print("Data successfully written to Google Sheets!")


    # Main execution
if __name__ == "__main__":
    print("Scraping FCA News...")
    
    # Scrape the updates
    updates = scrape_taskforce_updates()
    
    if updates:

        # Save to google sheets file
        write_to_google_sheets(updates, "FCA Publications")
        
        ##print(updates)

        print(f"\nSuccessfully scraped {len(updates)} updates!")
    else:
        print("No updates found or error occurred during scraping.")
