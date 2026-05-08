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

    #print(formatted_date)  
    return formatted_date

# Converts dd/mm/yyyy to dd mm yyyy
def convert_dmy_to_ddmmyyy(string_date):
    # Original date string
    date_str = string_date

    # Convert string to datetime object
    date_obj = datetime.strptime(date_str, "%d/%m/%Y")

    # Format datetime object to desired string format
    formatted_date = date_obj.strftime("%d %B %Y")

    ###  print(formatted_date)  
    return formatted_date


def scrape_taskforce_updates():
    
    # Set up headers to mimic a real browser request
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }
    
    try:

        # Base URL for CFTC press releases
        BASE_URL = "https://www.cftc.gov"
        PRESS_RELEASES_URL = f"{BASE_URL}/PressRoom/PressReleases"

        # Fetch the page
        response = requests.get(PRESS_RELEASES_URL)
        soup = BeautifulSoup(response.text, "html.parser")

        # Find all rows in the press releases table
        # If the site structure changes, update the selectors accordingly
        table = soup.find('table')
        rows = table.find_all('tr')[1:]  # Skip header
        
        data = []
        for row in rows:
            cols = row.find_all('td')
            if len(cols) < 2:
                continue
            ## the_date = cols[0].get_text(strip=True)
            the_date = convert_mdy_to_ddmmyyy(cols[0].get_text(strip=True))
            ## print(f"DEBUG: The converted date is: {the_date}")
            title_and_id = cols[1].get_text(strip=True)
            
            # Extract unique press release ID (e.g., 9086-25)
            match = re.search(r'(\d{4,}-\d{2})', title_and_id)
            if match:
                pr_id = match.group(1)
                # Construct the full link
                link = f"{BASE_URL}/PressRoom/PressReleases/{pr_id}"
            else:
                link = ""
            data.append({
                "Date": the_date,
                "Press Release": title_and_id,
                "Link": link
            })

        # Convert to DataFrame and display/save
        df = pd.DataFrame(data)
        #*** print(data)
        # Getting first 5 rows from the DataFrame
        df_first_5= df.head(5)
        # print(df_first_5)
          
        return data[:5]
        
    except requests.RequestException as e:
        print(f"Error fetching the webpage: {e}")
        return []
    except Exception as e:
        print(f"Error parsing the content: {e}")
        return []


def write_to_google_sheets(updates):
    
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
    worksheet = spreadsheet.worksheet("CFTC Press Releases")

    worksheet.clear()

    # Append email info to worksheet
    #*** emailRecipient_sheet_data = [[emailRecipient]]
    #*** worksheet.append_rows(emailRecipient_sheet_data)

    #*** emailSubject_sheet_data = [[emailSubject]]
    #*** worksheet.append_rows( emailSubject_sheet_data)

    # Define row headers
    scraped_data_headers = [
            ['Reg Area', 'Issue Date', 'Press Release', 'Link']
        ]

    # Append the data to the worksheet
    # This will add the header data to the first empty row.
    worksheet.append_rows(scraped_data_headers)

    ### This will loop through the list and add the row data to the first empty row.
    for i, update in enumerate(updates, 1):
            scraped_data_row_elements = ["CFTC Press Releases", update['Date'], update['Press Release'],
                                update['Link'] ]
            scraped_data_row = [scraped_data_row_elements]
            worksheet.append_rows(scraped_data_row)    

    print("Data successfully written to Google Sheets!")


# Main execution
if __name__ == "__main__":
    print("Scraping CFC updates...")
    
    # Scrape the updates
    updates = scrape_taskforce_updates()
    
    if updates:

        # Save to google sheets file
        write_to_google_sheets(updates)
        
        ##print(updates)

        print(f"\nSuccessfully scraped {len(updates)} updates!")
    else:
        print("No updates found or error occurred during scraping.")