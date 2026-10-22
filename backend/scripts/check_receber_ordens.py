import openpyxl

wb = openpyxl.load_workbook(r'C:\ANJUN\Receber ordens-20261022080746016-7aPEpU.xlsx', read_only=True)
sheet = wb.active
print("Active sheet:", sheet.title)
for i, row in enumerate(sheet.iter_rows(values_only=True)):
    if i == 0:
        print("Header:", row)
    elif i <= 5:
        print(f"Row {i}:", row[:10])
    else:
        break
